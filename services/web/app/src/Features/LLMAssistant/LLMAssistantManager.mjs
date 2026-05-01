import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import { db } from '../../infrastructure/mongodb.mjs'
import Mongo from '../Helpers/Mongo.mjs'

const MAX_MESSAGE_LENGTH = 4000
const MAX_CONTEXT_LENGTH = 20000
const { normalizeQuery } = Mongo

class LLMAssistantPublicError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

const SYSTEM_PROMPT = `You are an academic writing assistant inside an Overleaf project.
Help with LaTeX papers by giving suggestions, revisions, explanations, and critique.
Do not claim that you modified the user's files.
Preserve LaTeX commands, labels, citations, equations, and environments unless the user asks to change them.
When rewriting, return copyable LaTeX-compatible text and briefly explain the main changes.
Do not include hidden reasoning, chain-of-thought, or <think> tags in your response.`

function getConfig() {
  return Settings.llmAssistant || {}
}

async function readStoredSettings(userId) {
  if (!userId) {
    return {}
  }

  const user = await db.users.findOne(normalizeQuery(userId), {
    projection: {
      llmAssistantSettings: 1,
    },
  })

  return user?.llmAssistantSettings || {}
}

async function writeStoredSettings(userId, settings) {
  if (!userId) {
    throw new LLMAssistantPublicError(
      'You must be logged in to update LLM assistant settings.',
      401
    )
  }

  await db.users.updateOne(normalizeQuery(userId), {
    $set: {
      llmAssistantSettings: settings,
    },
  })
}

async function getEffectiveConfig(userId) {
  const envConfig = getConfig()
  const storedSettings = await readStoredSettings(userId)

  return {
    ...envConfig,
    ...storedSettings,
    apiKey: storedSettings.apiKey || envConfig.apiKey,
  }
}

async function assertConfigured(userId) {
  const config = await getEffectiveConfig(userId)

  if (!config.enabled) {
    throw new LLMAssistantPublicError('LLM assistant is not enabled.', 503)
  }
  if (!config.baseURL) {
    throw new LLMAssistantPublicError(
      'LLM assistant base URL is not configured.',
      503
    )
  }
  if (!config.apiKey) {
    throw new LLMAssistantPublicError(
      'LLM assistant API key is not configured.',
      503
    )
  }
  if (!config.model) {
    throw new LLMAssistantPublicError(
      'LLM assistant model is not configured.',
      503
    )
  }

  return config
}

async function getSettingsForClient(userId) {
  const config = await getEffectiveConfig(userId)

  return {
    enabled: Boolean(config.enabled),
    baseURL: config.baseURL || '',
    model: config.model || '',
    hasApiKey: Boolean(config.apiKey),
  }
}

function cleanOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  return value.trim()
}

function validateBaseURL(baseURL) {
  if (!baseURL) {
    return
  }

  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
  } catch (error) {
    throw new LLMAssistantPublicError('LLM assistant URL is invalid.', 400)
  }
}

async function updateSettings(userId, { enabled, baseURL, apiKey, model }) {
  const storedSettings = await readStoredSettings(userId)
  const nextSettings = {
    ...storedSettings,
  }

  if (typeof enabled === 'boolean') {
    nextSettings.enabled = enabled
  }

  const cleanedBaseURL = cleanOptionalString(baseURL)
  if (cleanedBaseURL !== undefined) {
    validateBaseURL(cleanedBaseURL)
    nextSettings.baseURL = cleanedBaseURL
  }

  const cleanedModel = cleanOptionalString(model)
  if (cleanedModel !== undefined) {
    nextSettings.model = cleanedModel
  }

  const cleanedApiKey = cleanOptionalString(apiKey)
  if (cleanedApiKey) {
    nextSettings.apiKey = cleanedApiKey
  }

  await writeStoredSettings(userId, nextSettings)
  return getSettingsForClient(userId)
}

function trimText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || ''
  }
  return `${text.slice(0, maxLength)}\n\n[Context truncated]`
}

function stripReasoningTags(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildPrompt({ message, docName, selection, documentText }) {
  const context = selection || documentText || ''
  let contextKind = 'No document context was provided.'
  if (selection) {
    contextKind = 'The user selected this text.'
  } else if (documentText) {
    contextKind = 'This is the currently open document.'
  }

  return `User request:
${message}

Document name:
${docName || 'Unknown'}

Context:
${contextKind}

<latex_context>
${trimText(context, MAX_CONTEXT_LENGTH)}
</latex_context>`
}

async function chat({
  userId,
  projectId,
  message,
  docName,
  selection,
  documentText,
}) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new LLMAssistantPublicError('Message is required.', 400)
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new LLMAssistantPublicError('Message is too long.', 400)
  }

  const config = await assertConfigured(userId)
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })

  try {
    const result = await generateText({
      model: openai.chat(config.model),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildPrompt({
            message: message.trim(),
            docName,
            selection: trimText(selection, MAX_CONTEXT_LENGTH),
            documentText: trimText(documentText, MAX_CONTEXT_LENGTH),
          }),
        },
      ],
      temperature: 0.3,
    })

    return stripReasoningTags(result.text)
  } catch (error) {
    logger.warn({ error, projectId }, 'LLM assistant request failed')
    throw new LLMAssistantPublicError(
      'LLM assistant request failed. Please try again.',
      502
    )
  }
}

export default {
  promises: {
    chat,
    getSettingsForClient,
    updateSettings,
  },
}

export { LLMAssistantPublicError }
