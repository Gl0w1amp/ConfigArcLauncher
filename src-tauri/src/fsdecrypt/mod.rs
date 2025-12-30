use std::{
    any::Any,
    fs::{create_dir_all, File, FileTimes},
    io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};

use aes::{
    cipher::{block_padding::NoPadding, BlockDecryptMut, InnerIvInit, KeyInit, KeyIvInit},
    Aes128Dec,
};
use anyhow::{anyhow, Result};
use chrono::{FixedOffset, TimeZone};
use exfat_fs::dir::{entry::fs::FsElement, Root};
use ntfs::{
    indexes::NtfsFileNameIndex, structured_values::NtfsStandardInformation, Ntfs,
    NtfsAttributeType, NtfsTime,
};
use serde::Serialize;

use self::{
    bootid::{BootId, ContainerType},
    crypto::{calculate_file_iv, calculate_page_iv, Aes128CbcDec, GameKeys, EXFAT_HEADER, NTFS_HEADER},
    keys::{load_keys, FsDecryptKeys},
};

mod bootid;
mod crypto;
mod keys;

const PAGE_SIZE: u64 = 4096;

#[derive(Serialize, Clone)]
pub struct DecryptResult {
    pub input: String,
    pub output: Option<String>,
    pub container_type: Option<String>,
    pub extracted: bool,
    pub warnings: Vec<String>,
    pub failed: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct DecryptSummary {
    pub results: Vec<DecryptResult>,
    pub key_source: String,
    pub key_game_count: usize,
}

#[derive(Serialize, Clone)]
pub struct DecryptProgress {
    pub percent: u8,
    pub processed: u64,
    pub total: u64,
    pub current_file: usize,
    pub total_files: usize,
}

#[derive(Serialize, Clone)]
pub struct KeyStatus {
    pub key_source: String,
    pub key_game_count: usize,
}

fn panic_message(err: Box<dyn Any + Send>) -> String {
    if let Some(msg) = err.downcast_ref::<&str>() {
        (*msg).to_string()
    } else if let Some(msg) = err.downcast_ref::<String>() {
        msg.clone()
    } else {
        "unknown panic".to_string()
    }
}

fn exfat_timestamp_to_system_time(timestamp: &exfat_fs::timestamp::Timestamp) -> Result<SystemTime> {
    let exfat_date = timestamp.date();
    let exfat_time = timestamp.time();
    let exfat_utc_offset = timestamp.utc_offset() as i32 * 15 * 60;
    let chrono_date_time = FixedOffset::east_opt(exfat_utc_offset)
        .ok_or_else(|| anyhow!("invalid utc offset: {}", timestamp.utc_offset()))?
        .with_ymd_and_hms(
            exfat_date.year as i32,
            exfat_date.month as u32,
            exfat_date.day as u32,
            exfat_time.hour as u32,
            exfat_time.minute as u32,
            exfat_time.second as u32,
        )
        .unwrap();

    Ok(SystemTime::UNIX_EPOCH
        + Duration::from_micros(chrono_date_time.timestamp_micros().try_into()?))
}

fn extract_exfat_contents(exfat_path: &Path) -> Result<PathBuf> {
    let output_dir = exfat_path.with_extension("");
    let file = File::open(exfat_path)?;
    let mut root = Root::open(file)?;

    create_dir_all(&output_dir)?;
    extract_exfat_elements(root.items(), &output_dir)?;

    Ok(output_dir)
}

fn extract_exfat_elements(elements: &mut [FsElement<File>], output_dir: &Path) -> Result<()> {
    for element in elements {
        match element {
            FsElement::F(ref mut file) => {
                let dest_path = output_dir.join(file.name());
                let mut dest = File::create(dest_path)?;

                dest.set_times(
                    FileTimes::new()
                        .set_accessed(exfat_timestamp_to_system_time(
                            file.timestamps().accessed(),
                        )?)
                        .set_modified(exfat_timestamp_to_system_time(
                            file.timestamps().modified(),
                        )?),
                )?;

                let mut writer = BufWriter::with_capacity(256 * 1024, &mut dest);

                std::io::copy(file, &mut writer)?;
            }
            FsElement::D(directory) => {
                let dest_path = output_dir.join(directory.name());
                create_dir_all(&dest_path)?;

                let mut children = directory.open()?;
                extract_exfat_elements(&mut children, &dest_path)?;
            }
        }
    }

    Ok(())
}

fn ntfs_time_to_system_time(ntfs_time: NtfsTime) -> SystemTime {
    let intervals_since_windows_epoch = ntfs_time.nt_timestamp();
    let intervals_since_unix_epoch = intervals_since_windows_epoch - 116_444_736_000_000_000;
    let nanos_since_unix_epoch = intervals_since_unix_epoch * 100;

    SystemTime::UNIX_EPOCH + Duration::from_nanos(nanos_since_unix_epoch)
}

fn extract_internal_vhd(image_path: &Path, sequence_number: u8) -> Result<PathBuf> {
    let vhd_filename = format!("internal_{sequence_number}.vhd");
    let output_path = image_path.with_extension("vhd");

    let mut fs = File::open(image_path)?;
    let mut ntfs = Ntfs::new(&mut fs)?;
    ntfs.read_upcase_table(&mut fs)?;

    let root_directory = ntfs.root_directory(&mut fs)?;
    let index = root_directory.directory_index(&mut fs)?;
    let mut finder = index.finder();
    let entry = NtfsFileNameIndex::find(&mut finder, &ntfs, &mut fs, &vhd_filename)
        .ok_or_else(|| anyhow!("could not find VHD {vhd_filename}"))??;
    let file = entry.to_file(&ntfs, &mut fs)?;
    let data_item = file
        .data(&mut fs, "")
        .ok_or_else(|| anyhow!("file data does not exist"))??;
    let data_attribute = data_item.to_attribute()?;
    let mut data_value = data_attribute.value(&mut fs)?.attach(&mut fs);

    let mut output_file = File::create(&output_path)?;
    let mut writer = BufWriter::with_capacity(256 * 1024, &mut output_file);

    std::io::copy(&mut data_value, &mut writer)?;
    writer.flush()?;
    drop(writer);

    let mut attributes_iterator = file.attributes();

    while let Some(attribute) = attributes_iterator.next(&mut fs) {
        let attribute = attribute?;
        let attribute = attribute.to_attribute()?;

        match attribute.ty() {
            Ok(NtfsAttributeType::StandardInformation) => {
                let info = attribute.resident_structured_value::<NtfsStandardInformation>()?;

                output_file.set_times(
                    FileTimes::new()
                        .set_accessed(ntfs_time_to_system_time(info.access_time()))
                        .set_modified(ntfs_time_to_system_time(info.modification_time())),
                )?;

                break;
            }
            _ => continue,
        }
    }

    Ok(output_path)
}

fn normalize_id(bytes: &[u8]) -> Result<String> {
    let raw = std::str::from_utf8(bytes).map_err(|e| anyhow!("invalid id: {e}"))?;
    Ok(raw.trim_matches(char::from(0)).trim().to_string())
}

fn read_bootid_from_reader(reader: &mut BufReader<File>, keys: &FsDecryptKeys) -> Result<BootId> {
    let mut bootid_bytes = [0u8; std::mem::size_of::<BootId>()];
    reader.read_exact(&mut bootid_bytes)?;

    let bootid_cipher =
        Aes128CbcDec::new_from_slices(&keys.bootid_key, &keys.bootid_iv).map_err(|e| anyhow!(e))?;
    bootid_cipher
        .clone()
        .decrypt_padded_mut::<NoPadding>(&mut bootid_bytes)
        .map_err(|e| anyhow!("Could not decrypt BootID: {e:#?}"))?;

    Ok(unsafe { std::ptr::read_unaligned(bootid_bytes.as_ptr() as *const BootId) })
}

fn output_size_from_bootid(bootid: &BootId) -> u64 {
    bootid
        .block_count
        .saturating_sub(bootid.header_block_count)
        .saturating_mul(bootid.block_size)
}

fn decrypt_container(
    path: &Path,
    no_extract: bool,
    keys: &FsDecryptKeys,
    result: &mut DecryptResult,
    mut progress: Option<&mut dyn FnMut(u64)>,
) -> Result<()> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(0x40000, file);

    let bootid = read_bootid_from_reader(&mut reader, keys)?;

    if bootid.container_type != ContainerType::OS
        && bootid.container_type != ContainerType::APP
        && bootid.container_type != ContainerType::OPTION
    {
        return Err(anyhow!("Unknown container type {}", bootid.container_type));
    }

    let os_id = normalize_id(&bootid.os_id)?;
    let game_id = normalize_id(&bootid.game_id)?;
    let id = match bootid.container_type {
        ContainerType::OS => os_id.clone(),
        _ => game_id.clone(),
    };

    let keys = match bootid.container_type {
        ContainerType::OS => keys
            .game_keys_for(&os_id)
            .ok_or_else(|| anyhow!("Key not found for {id}"))?,
        ContainerType::APP => keys
            .game_keys_for(&game_id)
            .ok_or_else(|| anyhow!("Key not found for {id}"))?,
        _ => GameKeys {
            key: keys.option_key,
            iv: Some(keys.option_iv),
        },
    };

    result.container_type = Some(match bootid.container_type {
        ContainerType::OS => "OS",
        ContainerType::APP => "APP",
        ContainerType::OPTION => "OPTION",
        _ => "UNKNOWN",
    }
    .to_string());

    let data_offset = bootid.header_block_count * bootid.block_size;
    let key = keys.key;
    let iv = if bootid.use_custom_iv { None } else { keys.iv };
    let iv = match iv {
        Some(iv) => iv,
        None => {
            reader.seek(SeekFrom::Start(data_offset))?;
            let mut page: Vec<u8> = Vec::with_capacity(PAGE_SIZE as usize);
            Read::by_ref(&mut reader).take(4096).read_to_end(&mut page)?;

            if bootid.container_type == ContainerType::OPTION {
                calculate_file_iv(key, EXFAT_HEADER, &page)?
            } else {
                calculate_file_iv(key, NTFS_HEADER, &page)?
            }
        }
    };

    let output_filename = match bootid.container_type {
        ContainerType::OS => format!(
            "{os_id}_{:<04}.{:<02}.{:<02}_{}_{}.ntfs",
            bootid.os_version.major,
            bootid.os_version.minor,
            bootid.os_version.release,
            bootid.target_timestamp,
            bootid.sequence_number
        ),
        ContainerType::APP => {
            if bootid.sequence_number > 0 {
                format!(
                    "{game_id}_{}.{:<02}.{:<02}_{}_{}_{}.{:<02}.{:<02}.ntfs",
                    unsafe { bootid.target_version.version.major },
                    unsafe { bootid.target_version.version.minor },
                    unsafe { bootid.target_version.version.release },
                    bootid.target_timestamp,
                    bootid.sequence_number,
                    bootid.source_version.major,
                    bootid.source_version.minor,
                    bootid.source_version.release,
                )
            } else {
                format!(
                    "{game_id}_{}.{:<02}.{:<02}_{}_{}.ntfs",
                    unsafe { bootid.target_version.version.major },
                    unsafe { bootid.target_version.version.minor },
                    unsafe { bootid.target_version.version.release },
                    bootid.target_timestamp,
                    bootid.sequence_number,
                )
            }
        }
        _ => {
            let option = normalize_id(unsafe { &bootid.target_version.option })?;
            format!(
                "{game_id}_{}_{}_{}.exfat",
                option,
                bootid.target_timestamp,
                bootid.sequence_number,
            )
        }
    };
    let output_path = path.with_file_name(&output_filename);
    let output_file = File::create(&output_path)?;
    let output_size = output_size_from_bootid(&bootid);

    output_file.set_len(output_size)?;

    let mut writer = BufWriter::with_capacity(0x40000, output_file);
    let cipher = Aes128Dec::new_from_slice(&key).map_err(|e| anyhow!(e))?;
    let mut page: Vec<u8> = Vec::with_capacity(PAGE_SIZE as usize);
    let mut page_iv = [0u8; 16];
    let mut processed: u64 = 0;
    let mut last_emit = Instant::now();
    let mut last_reported: u64 = 0;

    reader.seek(SeekFrom::Start(data_offset))?;

    for _ in 0..(output_size / PAGE_SIZE) {
        let file_offset = reader.stream_position()? - data_offset;
        let reference = Read::by_ref(&mut reader);

        calculate_page_iv(file_offset, &iv, &mut page_iv);
        page.clear();
        reference.take(PAGE_SIZE).read_to_end(&mut page)?;

        let page_cipher = Aes128CbcDec::inner_iv_slice_init(cipher.clone(), &page_iv)
            .map_err(|e| anyhow!(e))?;
        page_cipher
            .decrypt_padded_mut::<NoPadding>(&mut page)
            .map_err(|e| anyhow!(e))?;

        writer.write_all(&page)?;
        processed = processed.saturating_add(PAGE_SIZE);
        if let Some(ref mut report) = progress {
            if last_emit.elapsed() >= Duration::from_millis(120) {
                report(processed);
                last_reported = processed;
                last_emit = Instant::now();
            }
        }
    }

    writer.flush()?;
    if let Some(ref mut report) = progress {
        if processed != last_reported {
            report(processed);
        }
    }

    if no_extract {
        result.output = Some(output_path.to_string_lossy().into_owned());
        return Ok(());
    }

    match bootid.container_type {
        ContainerType::OS | ContainerType::APP => match extract_internal_vhd(&output_path, bootid.sequence_number) {
            Ok(vhd_path) => {
                let _ = std::fs::remove_file(&output_path);
                result.output = Some(vhd_path.to_string_lossy().into_owned());
                result.extracted = true;
            }
            Err(e) => {
                result.output = Some(output_path.to_string_lossy().into_owned());
                result.warnings.push(format!("Failed to extract internal VHD: {e:#}"));
            }
        },
        ContainerType::OPTION => match extract_exfat_contents(&output_path) {
            Ok(dir) => {
                let _ = std::fs::remove_file(&output_path);
                result.output = Some(dir.to_string_lossy().into_owned());
                result.extracted = true;
            }
            Err(e) => {
                result.output = Some(output_path.to_string_lossy().into_owned());
                result.warnings.push(format!("Failed to extract exfat contents: {e:#}"));
            }
        },
        _ => {
            result.output = Some(output_path.to_string_lossy().into_owned());
        }
    }

    Ok(())
}

pub fn decrypt_game_files(
    files: Vec<PathBuf>,
    no_extract: bool,
    key_url: Option<String>,
    mut progress: Option<&mut dyn FnMut(DecryptProgress)>,
    mut on_result: Option<&mut dyn FnMut(DecryptResult)>,
) -> Result<DecryptSummary> {
    let (keys, info) = load_keys(key_url.as_deref())?;
    let mut results = Vec::new();

    let mut file_sizes = Vec::new();
    let mut total_bytes = 0u64;
    if progress.is_some() {
        for path in &files {
            let estimated = (|| -> Result<u64> {
                let file = File::open(path)?;
                let mut reader = BufReader::with_capacity(0x40000, file);
                let bootid = read_bootid_from_reader(&mut reader, &keys)?;
                Ok(output_size_from_bootid(&bootid))
            })()
            .or_else(|_| {
                path.metadata()
                    .map(|meta| meta.len())
                    .map_err(|e| anyhow!(e))
            })
            .unwrap_or(0);
            file_sizes.push(estimated);
            total_bytes = total_bytes.saturating_add(estimated);
        }
        if total_bytes == 0 {
            total_bytes = 1;
        }
    }

    let mut processed_total: u64 = 0;
    let mut last_percent: u8 = 0;
    let mut last_emit = Instant::now();

    let mut emit_progress = |progress: &mut Option<&mut dyn FnMut(DecryptProgress)>,
                             processed: u64,
                             current_file: usize,
                             total_files: usize,
                             force: bool| {
        if let Some(cb) = progress.as_mut() {
            let percent = processed
                .saturating_mul(100)
                .saturating_div(total_bytes)
                .min(100) as u8;
            if force || percent != last_percent || last_emit.elapsed() >= Duration::from_millis(150) {
                last_percent = percent;
                last_emit = Instant::now();
                cb(DecryptProgress {
                    percent,
                    processed,
                    total: total_bytes,
                    current_file,
                    total_files,
                });
            }
        }
    };

    let total_files = files.len();
    if progress.is_some() {
        emit_progress(&mut progress, processed_total, 0, total_files, true);
    }
    for path in files {
        let mut entry = DecryptResult {
            input: path.to_string_lossy().into_owned(),
            output: None,
            container_type: None,
            extracted: false,
            warnings: Vec::new(),
            failed: false,
            error: None,
        };

        let current_file = results.len() + 1;
        let mut last_in_file = 0u64;
        let has_progress = progress.is_some();
        let mut report_progress = |processed_in_file: u64| {
            let delta = processed_in_file.saturating_sub(last_in_file);
            last_in_file = processed_in_file;
            processed_total = processed_total.saturating_add(delta);
            if processed_total > total_bytes {
                processed_total = total_bytes;
            }
            emit_progress(
                &mut progress,
                processed_total,
                current_file,
                total_files,
                false,
            );
        };
        let progress_ref: Option<&mut dyn FnMut(u64)> = if has_progress {
            Some(&mut report_progress)
        } else {
            None
        };

        let decrypt_outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            decrypt_container(&path, no_extract, &keys, &mut entry, progress_ref)
        }));
        match decrypt_outcome {
            Ok(Ok(())) => {}
            Ok(Err(err)) => {
                entry.error = Some(err.to_string());
                entry.failed = true;
            }
            Err(err) => {
                entry.error = Some(format!("Decrypt panic: {}", panic_message(err)));
                entry.failed = true;
            }
        }

        if progress.is_some() {
            if let Some(estimated) = file_sizes.get(current_file - 1).copied() {
                if last_in_file < estimated {
                    processed_total = processed_total.saturating_add(estimated - last_in_file);
                    if processed_total > total_bytes {
                        processed_total = total_bytes;
                    }
                    emit_progress(
                        &mut progress,
                        processed_total,
                        current_file,
                        total_files,
                        true,
                    );
                }
            }
        }

        if let Some(cb) = on_result.as_mut() {
            cb(entry.clone());
        }
        results.push(entry);
    }

    if progress.is_some() {
        processed_total = total_bytes;
        emit_progress(&mut progress, processed_total, total_files, total_files, true);
    }

    Ok(DecryptSummary {
        results,
        key_source: info.source,
        key_game_count: info.game_count,
    })
}

pub fn load_key_status(key_url: Option<String>) -> Result<KeyStatus> {
    let (_keys, info) = load_keys(key_url.as_deref())?;
    Ok(KeyStatus {
        key_source: info.source,
        key_game_count: info.game_count,
    })
}
