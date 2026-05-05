import { vol } from 'memfs'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { runExtractor } from '../src/index'
import type { I18nextToolkitConfig } from '../src/index'
import { resolve } from 'path'

vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs')
  return memfs.fs.promises
})

vi.mock('glob', () => ({
  glob: vi.fn(),
}))

const baseConfig = (
  overrides: Partial<I18nextToolkitConfig['extract']> = {}
): I18nextToolkitConfig => ({
  locales: ['en', 'de', 'fr'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    output: 'locales/{{language}}/{{namespace}}.json',
    functions: ['t'],
    transComponents: ['Trans'],
    defaultNS: 'translation',
    ...overrides,
  },
})

describe('extractor: extract.secondaryLanguages', () => {
  beforeEach(async () => {
    vol.reset()
    vi.clearAllMocks()
    vi.spyOn(process, 'cwd').mockReturnValue('/')

    const { glob } = await import('glob')
    vi.mocked(glob).mockImplementation(async () => {
      const candidates = ['/src/App.tsx']
      return candidates.filter(p => vol.existsSync(p))
    })
  })

  it('writes only the primary translation file when secondaryLanguages is []', async () => {
    vol.fromJSON({
      '/src/App.tsx': `
        function App() {
          return <div>{t('hello', { defaultValue: 'Hi' })}</div>;
        }
      `,
    })

    await runExtractor(baseConfig({ secondaryLanguages: [] }))

    const enPath = resolve(process.cwd(), 'locales/en/translation.json')
    const dePath = resolve(process.cwd(), 'locales/de/translation.json')
    const frPath = resolve(process.cwd(), 'locales/fr/translation.json')

    expect(vol.existsSync(enPath)).toBe(true)
    expect(vol.existsSync(dePath)).toBe(false)
    expect(vol.existsSync(frPath)).toBe(false)

    const enJson = JSON.parse(await vol.promises.readFile(enPath, 'utf-8') as string)
    expect(enJson).toEqual({ hello: 'Hi' })
  })

  it('leaves a pre-existing secondary file untouched when secondaryLanguages is []', async () => {
    const dePath = resolve(process.cwd(), 'locales/de/translation.json')
    const existingDe = { hello: 'Hallo', stale: 'Veraltet' }

    vol.fromJSON({
      '/src/App.tsx': `
        function App() {
          return <div>{t('hello', { defaultValue: 'Hi' })}</div>;
        }
      `,
      [dePath]: JSON.stringify(existingDe, null, 2),
    })

    await runExtractor(baseConfig({ secondaryLanguages: [] }))

    const deJson = JSON.parse(await vol.promises.readFile(dePath, 'utf-8') as string)
    expect(deJson).toEqual(existingDe)
  })

  it('writes only the primary plus listed secondaryLanguages, skipping unlisted locales', async () => {
    vol.fromJSON({
      '/src/App.tsx': `
        function App() {
          return <div>{t('hello', { defaultValue: 'Hi' })}</div>;
        }
      `,
    })

    await runExtractor(baseConfig({ secondaryLanguages: ['de'] }))

    const enPath = resolve(process.cwd(), 'locales/en/translation.json')
    const dePath = resolve(process.cwd(), 'locales/de/translation.json')
    const frPath = resolve(process.cwd(), 'locales/fr/translation.json')

    expect(vol.existsSync(enPath)).toBe(true)
    expect(vol.existsSync(dePath)).toBe(true)
    expect(vol.existsSync(frPath)).toBe(false)
  })
})
