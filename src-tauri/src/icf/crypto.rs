use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use anyhow::{anyhow, Result};
use hex_literal::hex;

type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;
type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

pub const ICF_KEY: [u8; 16] = hex!("09ca5efd30c9aaef3804d0a7e3fa7120");
pub const ICF_IV: [u8; 16] = hex!("b155c22c2e7f0491fa7f0fdc217aff90");

/// Decrypts an ICF using the provided key and IV.
pub fn decrypt_icf(
    data: &mut [u8],
    key: impl AsRef<[u8]>,
    iv: impl AsRef<[u8]>,
) -> Result<Vec<u8>> {
    let size = data.len();

    let mut decrypted = Vec::with_capacity(size);

    for i in (0..size).step_by(4096) {
        let from_start = i;

        let bufsz = std::cmp::min(4096, size - from_start);
        let buf = &data[i..i + bufsz];
        let mut decbuf = vec![0; bufsz];

        let cipher = Aes128CbcDec::new_from_slices(key.as_ref(), iv.as_ref())?;
        cipher
            .decrypt_padded_b2b_mut::<NoPadding>(buf, &mut decbuf)
            .map_err(|err| anyhow!(err))?;

        let xor1 = u64::from_le_bytes(decbuf[0..8].try_into()?) ^ (from_start as u64);
        let xor2 = u64::from_le_bytes(decbuf[8..16].try_into()?) ^ (from_start as u64);

        decrypted.extend(xor1.to_le_bytes());
        decrypted.extend(xor2.to_le_bytes());
        decrypted.extend(&decbuf[16..]);
    }

    Ok(decrypted)
}

/// Encrypts an ICF using the provided key and IV.
pub fn encrypt_icf(data: &[u8], key: impl AsRef<[u8]>, iv: impl AsRef<[u8]>) -> Result<Vec<u8>> {
    let size = data.len();

    let mut encrypted = Vec::with_capacity(size);
    let mut to_be_encrypted = Vec::with_capacity(std::cmp::min(4096, size));

    for i in (0..size).step_by(4096) {
        let from_start = i;

        let bufsz = std::cmp::min(4096, size - from_start);
        let buf = &data[i..i + bufsz];
        let mut encbuf = vec![0; bufsz];

        let xor1 = u64::from_le_bytes(buf[0..8].try_into()?) ^ (from_start as u64);
        let xor2 = u64::from_le_bytes(buf[8..16].try_into()?) ^ (from_start as u64);

        to_be_encrypted.extend(xor1.to_le_bytes());
        to_be_encrypted.extend(xor2.to_le_bytes());
        to_be_encrypted.extend(&buf[16..]);

        let cipher = Aes128CbcEnc::new_from_slices(key.as_ref(), iv.as_ref())?;
        cipher
            .encrypt_padded_b2b_mut::<NoPadding>(&to_be_encrypted, &mut encbuf)
            .map_err(|err| anyhow!(err))?;

        encrypted.extend(encbuf);
        to_be_encrypted.clear();
    }

    Ok(encrypted)
}
