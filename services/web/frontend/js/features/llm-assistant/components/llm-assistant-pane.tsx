import { postJSON, FetchError } from '@/infrastructure/fetch-json'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorSelectionContext } from '@/shared/context/editor-selection-context'
import MaterialIcon from '@/shared/components/material-icon'
import DOMPurify from 'dompurify'
import { micromark } from 'micromark'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import withErrorBoundary from '@/infrastructure/error-boundary'
import type { EditorSelection } from '@codemirror/state'

type LLMAssistantMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

type LLMAssistantResponse = {
  reply: string
}

const MAX_CONTEXT_CHARS = 20000
const MARKDOWN_LINK_REL = 'noreferrer noopener'
const MARKDOWN_LINK_TARGET = '_blank'
const MARKDOWN_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    '#text',
    'a',
    'blockquote',
    'br',
    'code',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'ul',
  ],
  ALLOWED_ATTR: ['href', 'title'],
}

function getSelectedText(
  documentText: string,
  editorSelection: EditorSelection | undefined
) {
  if (!editorSelection) {
    return ''
  }

  return editorSelection.ranges
    .filter(range => !range.empty)
    .map(range => {
      const from = Math.min(range.from, range.to)
      const to = Math.max(range.from, range.to)
      return documentText.slice(from, to)
    })
    .filter(Boolean)
    .join('\n\n')
}

function trimContext(text: string) {
  if (text.length <= MAX_CONTEXT_CHARS) {
    return text
  }
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[Context truncated]`
}

function sanitizeMarkdown(markdown: string) {
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName === 'A') {
      node.setAttribute('rel', MARKDOWN_LINK_REL)
      node.setAttribute('target', MARKDOWN_LINK_TARGET)
    }
  })

  try {
    return DOMPurify.sanitize(micromark(markdown), MARKDOWN_SANITIZE_CONFIG)
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes')
  }
}

function LLMAssistantMarkdown({ content }: { content: string }) {
  const html = useMemo(() => sanitizeMarkdown(content), [content])

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function LLMAssistantPane() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const { currentDocument, currentDocumentId, openDocName } =
    useEditorOpenDocContext()
  const { editorSelection } = useEditorSelectionContext()
  const [messages, setMessages] = useState<LLMAssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMessage() {
    const message = input.trim()
    if (!message || isPending) {
      return
    }

    const documentText = currentDocument?.getSnapshot() ?? ''
    const selection = getSelectedText(documentText, editorSelection)
    const nextUserMessage: LLMAssistantMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
    }

    setMessages(existingMessages => [...existingMessages, nextUserMessage])
    setInput('')
    setError(null)
    setIsPending(true)

    try {
      const response = await postJSON<LLMAssistantResponse>(
        `/project/${projectId}/llm-assistant/chat`,
        {
          body: {
            message,
            docId: currentDocumentId,
            docName: openDocName,
            selection: selection ? trimContext(selection) : undefined,
            documentText: selection ? undefined : trimContext(documentText),
          },
        }
      )

      setMessages(existingMessages => [
        ...existingMessages,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.reply,
        },
      ])
    } catch (error) {
      if (error instanceof FetchError) {
        setError(error.getUserFacingMessage())
      } else {
        setError(t('llm_assistant_error'))
      }
    } finally {
      setIsPending(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    sendMessage()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const selectingCharacter = event.nativeEvent.isComposing
    if (event.key === 'Enter' && !event.shiftKey && !selectingCharacter) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="llm-assistant-panel">
      <RailPanelHeader title={t('llm_assistant')} />
      <div className="llm-assistant-wrapper">
        <div className="llm-assistant-messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="llm-assistant-empty-state">
              <span className="llm-assistant-empty-state-icon">
                <MaterialIcon type="auto_awesome" />
              </span>
              <div className="llm-assistant-empty-state-title">
                {t('llm_assistant')}
              </div>
              <div className="llm-assistant-empty-state-body">
                {t('llm_assistant_empty_state')}
              </div>
            </div>
          ) : (
            <ol className="llm-assistant-message-list">
              {messages.map(message => (
                <li
                  key={message.id}
                  className={`llm-assistant-message llm-assistant-message-${message.role}`}
                >
                  <div className="llm-assistant-message-label">
                    {message.role === 'user' ? t('you') : t('llm_assistant')}
                  </div>
                  <div className="llm-assistant-message-content">
                    {message.role === 'assistant' ? (
                      <LLMAssistantMarkdown content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {isPending && (
            <div className="llm-assistant-pending">
              {t('llm_assistant_thinking')}
            </div>
          )}
          {error && <div className="llm-assistant-error">{error}</div>}
        </div>
        <form className="llm-assistant-input" onSubmit={handleSubmit}>
          <label htmlFor="llm-assistant-input" className="visually-hidden">
            {t('llm_assistant_input_placeholder')}
          </label>
          <textarea
            id="llm-assistant-input"
            value={input}
            placeholder={t('llm_assistant_input_placeholder')}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || !input.trim()}
          >
            {t('send')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default withErrorBoundary(LLMAssistantPane)
