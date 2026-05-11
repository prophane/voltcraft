declare module 'selfsigned' {
  interface Attribute {
    name: string
    value: string
  }

  interface GenerateOptions {
    algorithm?: string
    keySize?: number
    notAfterDate?: Date
    extensions?: Array<Record<string, unknown>>
  }

  interface GenerateResult {
    cert: string
    private: string
    public?: string
    fingerprint?: string
  }

  const selfsigned: {
    generate(attributes?: Attribute[], options?: GenerateOptions): GenerateResult | Promise<GenerateResult>
  }

  export default selfsigned
}