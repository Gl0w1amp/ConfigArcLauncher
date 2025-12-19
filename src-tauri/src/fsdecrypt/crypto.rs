use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use anyhow::{anyhow, Result};
use hex_literal::hex;

pub const NTFS_HEADER: [u8; 16] = hex!("eb52904e544653202020200010010000");
pub const EXFAT_HEADER: [u8; 16] = hex!("eb769045584641542020200000000000");

pub type Aes128CbcDec = cbc::Decryptor<aes::Aes128Dec>;

#[derive(Clone)]
pub struct GameKeys {
    pub key: [u8; 16],
    pub iv: Option<[u8; 16]>,
}

pub fn calculate_page_iv(file_offset: u64, file_iv: &[u8], page_iv: &mut [u8]) {
    for (i, (fbyte, pbyte)) in file_iv.iter().zip(page_iv.iter_mut()).enumerate() {
        *pbyte = fbyte ^ (file_offset >> (8 * (i % 8))) as u8;
    }
}

pub fn calculate_file_iv(
    key: [u8; 16],
    expected_header: [u8; 16],
    first_page: &[u8],
) -> Result<[u8; 16]> {
    let mut iv = [0u8; 16];
    let mut header = [0u8; 16];

    header.copy_from_slice(&first_page[..16]);

    calculate_page_iv(0, &expected_header, &mut iv);

    let cipher = Aes128CbcDec::new_from_slices(&key, &iv).map_err(|e| anyhow!(e))?;

    cipher
        .decrypt_padded_mut::<NoPadding>(&mut header)
        .map_err(|e| anyhow!(e))?;

    Ok(header)
}
