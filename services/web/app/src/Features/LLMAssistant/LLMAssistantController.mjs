import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../Authentication/SessionManager.mjs'
import LLMAssistantManager, {
  LLMAssistantPublicError,
} from './LLMAssistantManager.mjs'

async function chat(req, res) {
  const { project_id: projectId } = req.params
  const { message, docName, selection, documentText } = req.body || {}
  const userId = SessionManager.getLoggedInUserId(req.session)

  try {
    const reply = await LLMAssistantManager.promises.chat({
      userId,
      projectId,
      message,
      docName,
      selection,
      documentText,
    })
    res.json({ reply })
  } catch (error) {
    if (error instanceof LLMAssistantPublicError) {
      res.status(error.statusCode).json({ message: error.message })
      return
    }
    throw error
  }
}

async function getSettings(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const settings =
    await LLMAssistantManager.promises.getSettingsForClient(userId)
  res.json(settings)
}

async function updateSettings(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  try {
    const settings = await LLMAssistantManager.promises.updateSettings(
      userId,
      req.body || {}
    )
    res.json(settings)
  } catch (error) {
    if (error instanceof LLMAssistantPublicError) {
      res.status(error.statusCode).json({ message: error.message })
      return
    }
    throw error
  }
}

export default {
  chat: expressify(chat),
  getSettings: expressify(getSettings),
  updateSettings: expressify(updateSettings),
}
