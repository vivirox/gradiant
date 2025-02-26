import { KeyPair, EncryptionContext } from '@/lib/zk/types'
import { createHash } from 'crypto'

export class ChatEncryptionService {
  private keyPairs: Map<string, KeyPair> = new Map()
  private sharedSecrets: Map<string, Uint8Array> = new Map()

  constructor() {}

  // For backward compatibility
  public static getInstance(): ChatEncryptionService {
    return new ChatEncryptionService()
  }

  async getOrCreateSharedKey(userId: string, recipientId: string): Promise<Uint8Array> {
    const key = `${userId}-${recipientId}`
    const reverseKey = `${recipientId}-${userId}`

    if (this.sharedSecrets.has(key)) {
      return this.sharedSecrets.get(key)!
    }

    if (this.sharedSecrets.has(reverseKey)) {
      return this.sharedSecrets.get(reverseKey)!
    }

    const sharedSecret = await this.generateSharedSecret(userId, recipientId)
    this.sharedSecrets.set(key, sharedSecret)
    return sharedSecret
  }

  private async generateSharedSecret(userId: string, recipientId: string): Promise<Uint8Array> {
    const userKeyPair = await this.getOrCreateKeyPair(userId)
    const recipientKeyPair = await this.getOrCreateKeyPair(recipientId)

    const sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: recipientKeyPair.publicKey,
      },
      userKeyPair.privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    )

    const exportedKey = await crypto.subtle.exportKey('raw', sharedSecret)
    return new Uint8Array(exportedKey)
  }

  private async getOrCreateKeyPair(userId: string): Promise<KeyPair> {
    if (this.keyPairs.has(userId)) {
      return this.keyPairs.get(userId)!
    }

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey']
    )

    const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

    const pair = {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    }

    this.keyPairs.set(userId, pair)
    return pair
  }

  async encryptMessage(
    message: string,
    sender: string | EncryptionContext,
    recipient?: string,
    threadId?: string
  ): Promise<any> {
    // Handle the new signature used in chat route
    if (typeof sender === 'string' && recipient) {
      const sharedSecret = await this.getOrCreateSharedKey(sender, recipient);
      const context: EncryptionContext = {
        senderId: sender,
        recipientId: recipient,
        threadId: threadId || '',
        sharedSecret
      };
      const encryptedContent = await this.encryptWithContext(message, context);

      return {
        id: this.generateMessageId(),
        encryptedContent,
        senderId: sender,
        recipientId: recipient,
        threadId: threadId || '',
        timestamp: new Date().toISOString()
      };
    }

    // Original method for existing callers
    return this.encryptWithContext(message, sender as EncryptionContext);
  }

  // Original encryption logic moved to this internal method
  private async encryptWithContext(message: string, context: EncryptionContext): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = new TextEncoder().encode(message)

    const key = await crypto.subtle.importKey(
      'raw',
      context.sharedSecret!,
      'AES-GCM',
      false,
      ['encrypt']
    )

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      data
    )

    const encryptedArray = new Uint8Array(encrypted)
    const result = new Uint8Array(iv.length + encryptedArray.length)
    result.set(iv)
    result.set(encryptedArray, iv.length)

    return Buffer.from(result).toString('base64')
  }

  async decryptMessage(encryptedMessage: string, context: EncryptionContext): Promise<string> {
    const data = Buffer.from(encryptedMessage, 'base64')
    const iv = data.slice(0, 12)
    const encrypted = data.slice(12)

    const key = await crypto.subtle.importKey(
      'raw',
      context.sharedSecret!,
      'AES-GCM',
      false,
      ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encrypted
    )

    return new TextDecoder().decode(decrypted)
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
} 