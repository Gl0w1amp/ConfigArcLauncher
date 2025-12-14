use anyhow::Result;
use binary_reader::BinaryReader;
use chrono::NaiveDateTime;

use super::models::Version;

pub fn decode_icf_version(rd: &mut BinaryReader) -> Result<Version> {
    let build = rd.read_u8()?;
    let minor = rd.read_u8()?;
    let major = rd.read_u16()?;

    Ok(Version {
        major,
        minor,
        build,
    })
}

pub fn decode_icf_datetime(rd: &mut BinaryReader) -> Result<NaiveDateTime> {
    let year = rd.read_u16()?;
    let month = rd.read_u8()?;
    let day = rd.read_u8()?;
    let hour = rd.read_u8()?;
    let minute = rd.read_u8()?;
    let second = rd.read_u8()?;
    let _padding = rd.read_u8()?;

    Ok(NaiveDateTime::parse_from_str(
        &format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"),
        "%Y-%m-%d %H:%M:%S",
    )?)
}
