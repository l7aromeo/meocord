import {
  type APIContainerComponent,
  type APIEmbed,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  resolveColor,
  TextDisplayBuilder,
} from 'discord.js'
import { type PresentedError, type ResponseContext, type ResponsePresenter, type ResponseView } from '@src/interface/index.js'
import { Theme } from '@src/common/theme.js'

/**
 * MeoCord's own presenter: a "⏳ Working on it…" loading view in the primary colour, and errors in the
 * error colour under "Oops!".
 */
export const defaultPresenter: ResponsePresenter = {
  loading: () => ({ text: 'Working on it…', emoji: '⏳', color: Theme.primaryColor }),
  error: (_context: ResponseContext, { message }: PresentedError) => ({
    title: 'Oops!',
    text: message,
    color: Theme.errorColor,
  }),
}

/** The id MeoCord gives the containers it renders, so a view left behind can be found again. */
export const RENDERED_CONTAINER_ID = 0x4d43

const presenters = new WeakMap<object, ResponsePresenter>()

/** Sets the presenter for the interactions a client receives. */
export function setPresenter(client: object, presenter: ResponsePresenter): void {
  presenters.set(client, presenter)
}

/** The presenter for an interaction's client, or the default one. */
export function presenterFor(client: object | null | undefined): ResponsePresenter {
  return (client && presenters.get(client)) || defaultPresenter
}

function textOf(view: ResponseView): string {
  return view.emoji ? `${view.emoji} ${view.text}` : view.text
}

/** A view as an embed. */
export function renderEmbed(view: ResponseView): APIEmbed {
  const embed = new EmbedBuilder().setDescription(textOf(view))
  if (view.title) embed.setTitle(view.title)
  if (view.color !== undefined) embed.setColor(view.color)
  return embed.toJSON()
}

/** A view as a Components V2 container, carrying MeoCord's id. */
export function renderContainer(view: ResponseView): APIContainerComponent {
  const container = new ContainerBuilder().setId(RENDERED_CONTAINER_ID)
  if (view.color !== undefined) container.setAccentColor(resolveColor(view.color))
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(view.title ? `### ${view.title}\n${textOf(view)}` : textOf(view)),
  )
  const json = container.toJSON()
  const extra = (view.components ?? []).map(component =>
    'toJSON' in component ? component.toJSON() : component,
  ) as APIContainerComponent['components']
  return { ...json, type: ComponentType.Container, components: [...json.components, ...extra] }
}
