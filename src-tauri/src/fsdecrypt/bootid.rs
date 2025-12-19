use std::fmt::Display;

#[allow(non_snake_case)]
pub mod ContainerType {
    pub const OS: u8 = 0x00;
    pub const APP: u8 = 0x01;
    pub const OPTION: u8 = 0x02;
}

#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct Timestamp {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub minute: u8,
    pub second: u8,
    unk1: u8,
}

impl Display for Timestamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{:<04}{:<02}{:<02}{:<02}{:<02}{:<02}",
            self.year, self.month, self.day, self.hour, self.minute, self.second
        )
    }
}

#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct Version {
    pub release: u8,
    pub minor: u8,
    pub major: u16,
}

#[derive(Clone, Copy)]
#[repr(C)]
pub union GameVersion {
    pub version: Version,
    pub option: [u8; 4],
}

#[derive(Clone, Copy)]
#[repr(C)]
pub struct BootId {
    pub crc32: u32,
    pub length: u32,
    pub signature: [u8; 4],
    unk1: u8,
    pub container_type: u8,
    pub sequence_number: u8,
    pub use_custom_iv: bool,
    pub game_id: [u8; 4],
    pub target_timestamp: Timestamp,
    pub target_version: GameVersion,
    pub block_count: u64,
    pub block_size: u64,
    pub header_block_count: u64,
    unk2: u64,
    pub os_id: [u8; 3],
    pub os_generation: u8,
    pub source_timestamp: Timestamp,
    pub source_version: Version,
    pub os_version: Version,
    pub padding: [u8; 8],
}
