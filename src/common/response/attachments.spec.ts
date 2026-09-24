import { AttachmentBuilder, ComponentType, EmbedBuilder } from 'discord.js'
import { attachmentFileName, keptAttachmentNames, rewriteAttachmentUrls } from '@src/common/response/attachments.js'

const cdn = (name: string, host = 'cdn.discordapp.com', folder = 'attachments') =>
  `https://${host}/${folder}/1/2/${name}?ex=abc&is=def&hm=123`
const kept = new Set(['card.png'])

describe('attachmentFileName', () => {
  it('names the file of an attachment on either Discord CDN host, ephemeral ones included', () => {
    expect(attachmentFileName(cdn('card.png'))).toBe('card.png')
    expect(attachmentFileName(cdn('card.png', 'media.discordapp.net'))).toBe('card.png')
    expect(attachmentFileName(cdn('card.png', 'cdn.discordapp.com', 'ephemeral-attachments'))).toBe('card.png')
    expect(attachmentFileName(cdn('my%20card.png'))).toBe('my card.png')
  })

  it('names nothing for another host, another CDN path, a folder, or something that is not a URL', () => {
    expect(attachmentFileName('https://example.com/attachments/1/2/card.png')).toBeUndefined()
    expect(attachmentFileName('https://cdn.discordapp.com/avatars/1/card.png')).toBeUndefined()
    expect(attachmentFileName('https://cdn.discordapp.com/attachments/1/2/')).toBeUndefined()
    expect(attachmentFileName('not a url')).toBeUndefined()
    expect(attachmentFileName(42)).toBeUndefined()
    expect(attachmentFileName(undefined)).toBeUndefined()
  })
})

describe('keptAttachmentNames', () => {
  it('reads the names of files sent as paths, named files, and builders', () => {
    const names = keptAttachmentNames(
      { files: ['/tmp/cards/a.png', { attachment: '/tmp/b.png' }, { attachment: Buffer.from(''), name: 'c.png' }, new AttachmentBuilder(Buffer.from(''), { name: 'd.png' }), { attachment: Buffer.from('') }, 7] },
      [],
    )

    expect([...names]).toEqual(['a.png', 'b.png', 'c.png', 'd.png'])
  })

  it("keeps the message's current attachments unless the edit lists the ones to keep", () => {
    const current = [{ name: 'old.png' }, { name: null }, {}]

    expect([...keptAttachmentNames({}, current)]).toEqual(['old.png'])
    expect([...keptAttachmentNames({ attachments: [{ name: 'listed.png' }, null] }, current)]).toEqual(['listed.png'])
  })
})

describe('rewriteAttachmentUrls', () => {
  it('points every embed image field at attachment:// for a kept file, and leaves the rest', () => {
    const [embed] = rewriteAttachmentUrls(
      {
        embeds: [
          new EmbedBuilder()
            .setImage(cdn('card.png'))
            .setThumbnail(cdn('card.png'))
            .setAuthor({ name: 'a', iconURL: cdn('card.png') })
            .setFooter({ text: 'f', iconURL: cdn('other.png') }),
        ],
      },
      kept,
    ).embeds as unknown as Record<string, { url?: string; icon_url?: string }>[]

    expect(embed.image.url).toBe('attachment://card.png')
    expect(embed.thumbnail.url).toBe('attachment://card.png')
    expect(embed.author.icon_url).toBe('attachment://card.png')
    expect(embed.footer.icon_url).toBe(cdn('other.png'))
  })

  it('rewrites Components V2 thumbnails, files, and media inside sections and containers', () => {
    const { components } = rewriteAttachmentUrls(
      {
        components: [
          { type: ComponentType.Thumbnail, media: { url: cdn('card.png') } },
          { type: ComponentType.File, file: { url: cdn('card.png') } },
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.Section,
                components: [{ type: ComponentType.TextDisplay, content: cdn('card.png') }],
                accessory: { type: ComponentType.Thumbnail, media: { url: cdn('card.png') } },
              },
              { type: ComponentType.MediaGallery, items: [{ media: { url: cdn('card.png') } }] },
            ],
          },
        ],
      },
      kept,
    )

    expect(components).toEqual([
      { type: ComponentType.Thumbnail, media: { url: 'attachment://card.png' } },
      { type: ComponentType.File, file: { url: 'attachment://card.png' } },
      {
        type: ComponentType.Container,
        components: [
          {
            type: ComponentType.Section,
            // Text is never rewritten, only media
            components: [{ type: ComponentType.TextDisplay, content: cdn('card.png') }],
            accessory: { type: ComponentType.Thumbnail, media: { url: 'attachment://card.png' } },
          },
          { type: ComponentType.MediaGallery, items: [{ media: { url: 'attachment://card.png' } }] },
        ],
      },
    ])
  })

  it('leaves a file not kept, and a component without media, as they are', () => {
    const payload = {
      embeds: [{ image: { url: cdn('gone.png') } }],
      components: [{ type: ComponentType.Thumbnail }, { type: ComponentType.File, file: null }],
    }

    expect(rewriteAttachmentUrls(payload, kept)).toEqual(payload)
  })

  it('returns the payload itself when the edited message keeps no file', () => {
    const payload = { embeds: [new EmbedBuilder().setImage(cdn('card.png'))] }

    expect(rewriteAttachmentUrls(payload, new Set())).toBe(payload)
  })
})
