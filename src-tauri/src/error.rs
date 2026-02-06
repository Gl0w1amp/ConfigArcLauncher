use serde::Serialize;
use crate::trusted::TrustedError;

pub use configarc_core::error::*;

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum ErrorCode {
    Unexpected,
    Io,
    Parse,
    Json,
    Network,
    Verification,
    Zip,
    NotFound,
    NoActiveGame,
    SegatoolsMissing,
    InvalidInput,
    DownloadCancelled,
    NoFilesSelected,
    NoFolderSelected,
    InvalidDirectory,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::Unexpected => "UNEXPECTED",
            ErrorCode::Io => "IO_ERROR",
            ErrorCode::Parse => "PARSE_ERROR",
            ErrorCode::Json => "JSON_ERROR",
            ErrorCode::Network => "NETWORK_ERROR",
            ErrorCode::Verification => "VERIFICATION_ERROR",
            ErrorCode::Zip => "ZIP_ERROR",
            ErrorCode::NotFound => "NOT_FOUND",
            ErrorCode::NoActiveGame => "NO_ACTIVE_GAME",
            ErrorCode::SegatoolsMissing => "SEGATOOLS_MISSING",
            ErrorCode::InvalidInput => "INVALID_INPUT",
            ErrorCode::DownloadCancelled => "DOWNLOAD_CANCELLED",
            ErrorCode::NoFilesSelected => "NO_FILES_SELECTED",
            ErrorCode::NoFolderSelected => "NO_FOLDER_SELECTED",
            ErrorCode::InvalidDirectory => "INVALID_DIRECTORY",
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code: code.as_str().to_string(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(code: ErrorCode, message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: code.as_str().to_string(),
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn from_message(message: impl Into<String>) -> Self {
        let message = message.into();
        let code = infer_error_code(&message);
        Self::new(code, message)
    }
}

fn infer_error_code(message: &str) -> ErrorCode {
    let lowered = message.to_lowercase();
    // Keep IRIS-compatible hinting for active game resolution failures.
    if lowered.contains("no active game selected") || lowered.contains("active game not found") {
        return ErrorCode::NoActiveGame;
    }
    if lowered.contains("segatools.ini not found") || lowered.contains("segatools missing") {
        return ErrorCode::SegatoolsMissing;
    }
    if lowered.contains("no files selected") {
        return ErrorCode::NoFilesSelected;
    }
    if lowered.contains("no folder selected") {
        return ErrorCode::NoFolderSelected;
    }
    if lowered.contains("invalid directory") {
        return ErrorCode::InvalidDirectory;
    }
    if lowered.contains("download cancelled") {
        return ErrorCode::DownloadCancelled;
    }
    if lowered.contains("missing required fields")
        || lowered.contains("name is required")
        || lowered.contains("invalid ")
        || lowered.contains("must be exactly")
        || lowered.contains("url is required")
    {
        return ErrorCode::InvalidInput;
    }
    if lowered.contains("io error:") {
        return ErrorCode::Io;
    }
    if lowered.contains("parse error:") {
        return ErrorCode::Parse;
    }
    if lowered.contains("json error:") {
        return ErrorCode::Json;
    }
    if lowered.contains("network error:") {
        return ErrorCode::Network;
    }
    if lowered.contains("verification failed:") {
        return ErrorCode::Verification;
    }
    if lowered.contains("zip error:") {
        return ErrorCode::Zip;
    }
    if lowered.contains("not found") {
        return ErrorCode::NotFound;
    }
    ErrorCode::Unexpected
}

impl From<String> for ApiError {
    fn from(message: String) -> Self {
        ApiError::from_message(message)
    }
}

impl From<&str> for ApiError {
    fn from(message: &str) -> Self {
        ApiError::from_message(message)
    }
}

impl From<ConfigError> for ApiError {
    fn from(err: ConfigError) -> Self {
        let code = match err {
            ConfigError::Io(_) => ErrorCode::Io,
            ConfigError::Parse(_) => ErrorCode::Parse,
            ConfigError::Json(_) => ErrorCode::Json,
            ConfigError::NotFound(_) => ErrorCode::NotFound,
        };
        let message = err.to_string();
        ApiError::with_details(code, message.clone(), message)
    }
}

impl From<GameError> for ApiError {
    fn from(err: GameError) -> Self {
        let code = match err {
            GameError::Io(_) => ErrorCode::Io,
            GameError::Json(_) => ErrorCode::Json,
            GameError::NotFound(_) => ErrorCode::NotFound,
            GameError::Launch(_) => ErrorCode::Unexpected,
        };
        let message = err.to_string();
        ApiError::with_details(code, message.clone(), message)
    }
}

impl From<TrustedError> for ApiError {
    fn from(err: TrustedError) -> Self {
        let code = match err {
            TrustedError::Network(_) => ErrorCode::Network,
            TrustedError::Io(_) => ErrorCode::Io,
            TrustedError::Parse(_) => ErrorCode::Parse,
            TrustedError::Verification(_) => ErrorCode::Verification,
            TrustedError::NotFound(_) => ErrorCode::NotFound,
            TrustedError::Zip(_) => ErrorCode::Zip,
        };
        let message = err.to_string();
        ApiError::with_details(code, message.clone(), message)
    }
}
