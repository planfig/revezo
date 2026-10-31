import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const MIN_SECRETS_KEY_LENGTH = 24;
const VERSION = "v1";

/**
 * Encrypts small values (provider options) with AES-256-GCM. The 256-bit key is derived
 * from REVEZO_SECRETS_KEY with scrypt and a random salt kept next to the data. The
 * associated data ties each value to its row, so a value copied to another row fails to open.
 */
export class SecretBox {
  #key: Buffer;

  constructor(passphrase: string, salt: Buffer) {
    this.#key = scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  }

  static newSalt(): Buffer {
    return randomBytes(16);
  }

  seal(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  }

  /** Throws when the key is wrong or the value was changed. */
  open(sealed: string, aad: string): string {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("unknown secret format");
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  }
}
