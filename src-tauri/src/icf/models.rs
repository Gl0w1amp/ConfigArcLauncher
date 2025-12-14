use std::fmt::Display;

use chrono::NaiveDateTime;
use serde::{de, Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
pub struct Version {
    pub major: u16,
    pub minor: u8,
    pub build: u8,
}

impl Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{:0>2}.{:0>2}", self.major, self.minor, self.build)
    }
}

impl Serialize for Version {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

// Preserve backwards compatibility by allowing either
// ```json
// "version": "80.54.01"
// ```
// or
// ```json
// "version": {
//     "major": 80,
//     "minor": 54,
//     "build": 01,
// }
// ```
fn deserialize_version<'de, D>(deserializer: D) -> Result<Version, D::Error>
where
    D: de::Deserializer<'de>
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrVersion {
        String(String),
        Version(Version),
    }

    let s: StringOrVersion = de::Deserialize::deserialize(deserializer)?;

    match s {
        StringOrVersion::String(s) => {
            let parts = s.split('.').collect::<Vec<&str>>();

            if parts.len() > 3 {
                return Err(de::Error::custom("A version must have exactly three components."));
            }

            let Ok(major) = parts[0].parse::<u16>() else {
                return Err(de::Error::custom("Major version must be a 16-bit unsigned integer."));
            };
            let Ok(minor) = parts[1].parse::<u8>() else {
                return Err(de::Error::custom("Minor version must be a 8-bit unsigned integer."));
            };
            let Ok(build) = parts[2].parse::<u8>() else {
                return Err(de::Error::custom("Build version must be a 8-bit unsigned integer."));
            };

            Ok(Version { major, minor, build })
        },
        StringOrVersion::Version(v) => Ok(v)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcfInnerData {
    pub id: String,

    #[serde(deserialize_with = "deserialize_version")]
    pub version: Version,

    #[serde(deserialize_with = "deserialize_version")]
    pub required_system_version: Version,
    pub datetime: NaiveDateTime,
    
    #[serde(default = "default_is_prerelease")]
    pub is_prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcfOptionData {
    #[serde(default = "empty_string")]
    pub app_id: String,

    pub option_id: String,
    
    #[serde(default = "empty_version", deserialize_with = "deserialize_version")]
    pub required_system_version: Version,
    
    pub datetime: NaiveDateTime,

    #[serde(default = "default_is_prerelease")]
    pub is_prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcfPatchData {
    #[serde(default = "empty_string")]
    pub id: String,

    pub sequence_number: u8,

    #[serde(deserialize_with = "deserialize_version")]
    pub source_version: Version,
    pub source_datetime: NaiveDateTime,

    #[serde(deserialize_with = "deserialize_version")]
    pub source_required_system_version: Version,

    #[serde(deserialize_with = "deserialize_version")]
    pub target_version: Version,
    pub target_datetime: NaiveDateTime,

    #[serde(deserialize_with = "deserialize_version")]
    pub target_required_system_version: Version,

    #[serde(default = "default_is_prerelease")]
    pub is_prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum IcfData {
    System(IcfInnerData),
    App(IcfInnerData),
    Patch(IcfPatchData),
    Option(IcfOptionData),
}

impl IcfData {
    pub fn is_prerelease(&self) -> bool {
        match self {
            IcfData::System(s) => s.is_prerelease,
            IcfData::App(a) => a.is_prerelease,
            IcfData::Option(o) => o.is_prerelease,
            IcfData::Patch(p) => p.is_prerelease,
        }
    }

    #[allow(dead_code)]
    pub fn filename(&self) -> String {
        match self {
            IcfData::System(data) => format!(
                "{}_{:04}.{:02}.{:02}_{}_0.pack",
                data.id,
                data.version.major,
                data.version.minor,
                data.version.build,
                data.datetime.format("%Y%m%d%H%M%S")
            ),
            IcfData::App(data) => format!(
                "{}_{}_{}_0.app",
                data.id,
                data.version,
                data.datetime.format("%Y%m%d%H%M%S")
            ),
            IcfData::Option(data) => format!(
                "{}_{}_{}_0.opt",
                data.app_id,
                data.option_id,
                data.datetime.format("%Y%m%d%H%M%S")
            ),
            IcfData::Patch(data) => format!(
                "{}_{}_{}_{}_{}.app",
                data.id,
                data.target_version,
                data.target_datetime.format("%Y%m%d%H%M%S"),
                data.sequence_number,
                data.source_version,
            ),
        }
    }
}

fn empty_string() -> String {
    String::new()
}

fn empty_version() -> Version {
    Version { major: 0, minor: 0, build: 0 }
}

fn default_is_prerelease() -> bool {
    false
}
