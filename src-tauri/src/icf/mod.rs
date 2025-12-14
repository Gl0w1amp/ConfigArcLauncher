mod crypto;
mod models;
mod parser;

pub use crypto::{decrypt_icf, encrypt_icf, ICF_IV, ICF_KEY};
pub use models::{IcfData, IcfInnerData, IcfOptionData, IcfPatchData, Version};
pub use parser::{decode_icf_datetime, decode_icf_version};

use anyhow::{anyhow, Result};
use binary_reader::{BinaryReader, Endian};
use chrono::{Datelike, Timelike, NaiveDateTime};

/// Fixes incorrect metadata caused by hex editing the ICF
#[allow(dead_code)]
pub fn fixup_icf(data: &mut [u8]) -> Result<()> {
    let mut rd = BinaryReader::from_u8(data);
    rd.endian = Endian::Little;

    let reported_icf_crc = rd.read_u32()?;

    let reported_size = rd.read_u32()?;
    let actual_size = data.len() as u32;
    if actual_size != reported_size {
        data[4..8].copy_from_slice(&actual_size.to_le_bytes());
    }

    let padding = rd.read_u64()?;
    if padding != 0 {
        return Err(anyhow!("Padding error. Expected 8 NULL bytes."));
    }

    let entry_count = rd.read_u64()?;
    let expected_size = 0x40 * (entry_count + 1);
    
    if actual_size as u64 != expected_size {
        let actual_entry_count = actual_size as u64 / 0x40 - 1;

        data[16..24].copy_from_slice(&actual_entry_count.to_le_bytes());
    }

    let _ = String::from_utf8(rd.read_bytes(4)?.to_vec())?;
    let _ = String::from_utf8(rd.read_bytes(3)?.to_vec())?;
    let _ = rd.read_u8()?;

    let reported_container_crc = rd.read_u32()?;
    let mut checksum = 0;

    for container in data.chunks_exact(0x40).skip(1) {
        if container[0] == 2 && container[1] == 1 {
            checksum ^= crc32fast::hash(container);
        }
    }

    if reported_container_crc != checksum {
        data[32..36].copy_from_slice(&checksum.to_le_bytes());
    }

    let icf_checksum = crc32fast::hash(&data[4..]);
    if icf_checksum != reported_icf_crc {
        data[0..4].copy_from_slice(&icf_checksum.to_le_bytes());
    }

    Ok(())
}

pub fn parse_icf(data: impl AsRef<[u8]>) -> Result<Vec<IcfData>> {
    let decrypted = data.as_ref();

    let mut rd = BinaryReader::from_u8(decrypted);
    rd.endian = Endian::Little;

    let checksum = crc32fast::hash(&decrypted[4..]);
    let reported_crc = rd.read_u32()?;
    if reported_crc != checksum {
        return Err(anyhow!(
            "Reported CRC32 ({reported_crc:02X}) does not match actual checksum ({checksum:02X})"
        ));
    }

    let reported_size = rd.read_u32()? as usize;
    let actual_size = decrypted.len();
    if actual_size != reported_size {
        return Err(anyhow!(
            "Reported size {reported_size} does not match actual size {actual_size}"
        ));
    }

    let padding = rd.read_u64()?;
    if padding != 0 {
        return Err(anyhow!("Padding error. Expected 8 NULL bytes."));
    }

    let entry_count: usize = rd.read_u64()?.try_into()?;
    let expected_size = 0x40 * (entry_count + 1);
    if actual_size != expected_size {
        return Err(anyhow!("Expected size {expected_size} ({entry_count} entries) does not match actual size {actual_size}"));
    }

    let app_id = String::from_utf8(rd.read_bytes(4)?.to_vec())?;
    let platform_id = String::from_utf8(rd.read_bytes(3)?.to_vec())?;
    let _platform_generation = rd.read_u8()?;

    let reported_crc = rd.read_u32()?;
    let mut checksum = 0;

    for container in decrypted.chunks_exact(0x40).skip(1) {
        if container[0] == 2 && container[1] == 1 {
            checksum ^= crc32fast::hash(container);
        }
    }

    if reported_crc != checksum {
        return Err(anyhow!("Reported container CRC32 ({reported_crc:02X}) does not match actual checksum ({checksum:02X})"));
    }

    if rd.read_bytes(28)?.iter().any(|b| *b != 0) {
        return Err(anyhow!("Padding error. Expected 24 NULL bytes."));
    }

    let mut entries: Vec<IcfData> = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        let sig = rd.read_u32()?;
        
        if sig != 0x0102 && sig != 0x0201 {
            return Err(anyhow!(
                "Container does not start with signature (0x0102 or 0x0201), byte {:#06x}",
                rd.pos
            ));
        }

        let is_prerelease = sig == 0x0201;
        let container_type = rd.read_u32()?;

        if rd.read_bytes(24)?.iter().any(|b| *b != 0) {
            return Err(anyhow!("Padding error. Expected 24 NULL bytes."));
        }

        let data: IcfData = match container_type {
            0x0000 | 0x0001 => {
                let version = decode_icf_version(&mut rd)?;
                let datetime = decode_icf_datetime(&mut rd)?;
                let required_system_version = decode_icf_version(&mut rd)?;

                if rd.read_bytes(16)?.iter().any(|b| *b != 0) {
                    return Err(anyhow!("Padding error. Expected 16 NULL bytes."));
                }

                match container_type {
                    0x0000 => IcfData::System(IcfInnerData {
                        id: platform_id.clone(),
                        version,
                        datetime,
                        required_system_version,
                        is_prerelease,
                    }),
                    0x0001 => IcfData::App(IcfInnerData {
                        id: app_id.clone(),
                        version,
                        datetime,
                        required_system_version,
                        is_prerelease,
                    }),
                    _ => unreachable!(),
                }
            }
            0x0002 => {
                let option_id = String::from_utf8(rd.read_bytes(4)?.to_vec())?;
                let datetime = decode_icf_datetime(&mut rd)?;
                let required_system_version = decode_icf_version(&mut rd)?;

                if rd.read_bytes(16)?.iter().any(|b| *b != 0) {
                    return Err(anyhow!("Padding error. Expected 16 NULL bytes."));
                }

                IcfData::Option(IcfOptionData {
                    app_id: app_id.clone(),
                    option_id,
                    datetime,
                    required_system_version,
                    is_prerelease,
                })
            }
            _ => {
                // PATCH container type also encode the patch's sequence number
                // in the higher 16 bits.
                // The lower 16 bits will always be 1.
                let sequence_number = (container_type >> 8) as u8;

                if (container_type & 1) == 0 || sequence_number == 0 {
                    rd.read_bytes(32)?;
                    continue;
                }

                let target_version = decode_icf_version(&mut rd)?;
                let target_datetime = decode_icf_datetime(&mut rd)?;
                let target_required_system_version = decode_icf_version(&mut rd)?;

                let source_version = decode_icf_version(&mut rd)?;
                let source_datetime = decode_icf_datetime(&mut rd)?;
                let source_required_system_version = decode_icf_version(&mut rd)?;

                IcfData::Patch(IcfPatchData {
                    id: app_id.clone(),
                    sequence_number,
                    source_version,
                    source_datetime,
                    source_required_system_version,
                    target_version,
                    target_datetime,
                    target_required_system_version,
                    is_prerelease,
                })
            }
        };

        entries.push(data);
    }

    Ok(entries)
}

pub fn decode_icf(data: &mut [u8]) -> Result<Vec<IcfData>> {
    let decrypted = decrypt_icf(data, ICF_KEY, ICF_IV)?;

    parse_icf(decrypted)
}

pub fn serialize_datetime(data: &mut Vec<u8>, datetime: NaiveDateTime) {
    data.extend((datetime.year() as u16).to_le_bytes());
    data.extend([
        datetime.month() as u8,
        datetime.day() as u8,
        datetime.hour() as u8,
        datetime.minute() as u8,
        datetime.second() as u8,
        0x00,
    ]);
}

pub fn serialize_version(data: &mut Vec<u8>, version: Version) {
    data.extend([version.build, version.minor]);
    data.extend(version.major.to_le_bytes());
}

pub fn serialize_icf(data: &[IcfData]) -> Result<Vec<u8>> {
    let entry_count = data.len();
    let icf_length = 0x40 * (entry_count + 1);
    let mut icf: Vec<u8> = Vec::with_capacity(icf_length);

    icf.extend([0x00; 0x40]);

    let mut platform_id: Option<String> = None;
    let mut app_id: Option<String> = None;

    for container in data {
        if container.is_prerelease() {
            icf.extend([0x01, 0x02, 0x00, 0x00]);
        } else {
            icf.extend([0x02, 0x01, 0x00, 0x00]);
        }

        match container {
            IcfData::System(s) => {
                platform_id = Some(s.id.clone());
                icf.extend([0x00; 4]);
            }
            IcfData::App(a) => {
                app_id = Some(a.id.clone());
                icf.extend([0x01, 0x00, 0x00, 0x00]);
            }
            IcfData::Option(_) => {
                icf.extend([0x02, 0x00, 0x00, 0x00]);
            }
            IcfData::Patch(p) => {
                icf.extend([0x01, p.sequence_number, 0x00, 0x00]);
            }
        }

        icf.extend([0x00; 24]);

        if let IcfData::Option(o) = container {
            icf.extend(o.option_id.as_bytes());
            serialize_datetime(&mut icf, o.datetime);
            icf.extend([0x00; 20]);
            continue;
        }

        let (version, datetime, required_system_version) = match container {
            IcfData::System(s) => (s.version, s.datetime, s.required_system_version),
            IcfData::App(s) => (s.version, s.datetime, s.required_system_version),
            IcfData::Patch(s) => (s.target_version, s.target_datetime, s.target_required_system_version),
            IcfData::Option(_) => unreachable!(),
        };

        serialize_version(&mut icf, version);
        serialize_datetime(&mut icf, datetime);
        serialize_version(&mut icf, required_system_version);

        if let IcfData::Patch(p) = container {
            serialize_version(&mut icf, p.source_version);
            serialize_datetime(&mut icf, p.source_datetime);
            serialize_version(&mut icf, p.source_required_system_version);
        } else {
            icf.extend([0x00; 16]);
        }
    }

    let platform_id = match platform_id {
        Some(s) => s,
        None => return Err(anyhow!("Missing entry of type System in provided ICF data")),
    };

    if platform_id.len() != 3 {
        return Err(anyhow!("Incorrect platform ID length: expected 3, got {}", platform_id.len()));
    }

    let app_id = match app_id {
        Some(s) => s,
        None => return Err(anyhow!("Missing entry of type App in provided ICF data")),
    };

    if app_id.len() != 4 {
        return Err(anyhow!("Incorrect app ID length: expected 4, got {}", app_id.len()));
    }

    let mut containers_checksum: u32 = 0;
    for container in icf.chunks(0x40).skip(1) {
        if container[0] == 2 && container[1] == 1 {
            containers_checksum ^= crc32fast::hash(container);
        }
    }

    icf[4..8].copy_from_slice(&(icf_length as u32).to_le_bytes());
    icf[16..24].copy_from_slice(&(entry_count as u64).to_le_bytes());
    icf[24..28].copy_from_slice(app_id.as_bytes());
    icf[28..31].copy_from_slice(platform_id.as_bytes());
    icf[32..36].copy_from_slice(&containers_checksum.to_le_bytes());

    let icf_crc = crc32fast::hash(&icf[4..]);
    
    icf[0..4].copy_from_slice(&icf_crc.to_le_bytes());

    Ok(icf)
}
