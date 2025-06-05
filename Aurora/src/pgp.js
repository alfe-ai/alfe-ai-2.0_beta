import * as openpgp from 'openpgp';

export async function generateKeyPair(name = 'user', email = 'user@example.com', passphrase = '') {
  return await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name, email }],
    passphrase
  });
}

export async function encryptMessage(text, publicKeyArmored) {
  if (!publicKeyArmored) return text;
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const message = await openpgp.createMessage({ text });
  return await openpgp.encrypt({ message, encryptionKeys: publicKey });
}

export async function decryptMessage(encryptedText, privateKeyArmored, passphrase) {
  if (!privateKeyArmored) return encryptedText;
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });
  const message = await openpgp.readMessage({ armoredMessage: encryptedText });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
  return data;
}
