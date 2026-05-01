import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getJSON,
  getUserFacingMessage,
  postJSON,
} from '@/infrastructure/fetch-json'
import useAsync from '@/shared/hooks/use-async'
import Setting from './setting'
import ToggleSetting from './toggle-setting'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLNotification from '@/shared/components/ol/ol-notification'

type LLMAssistantSettingsResponse = {
  enabled: boolean
  baseURL: string
  model: string
  hasApiKey: boolean
}

export default function LLMAssistantSettings() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)

  const loadSettings = useAsync<LLMAssistantSettingsResponse>()
  const saveSettings = useAsync<LLMAssistantSettingsResponse>()

  useEffect(() => {
    loadSettings
      .runAsync(
        getJSON<LLMAssistantSettingsResponse>('/llm-assistant/settings')
      )
      .then(settings => {
        setEnabled(settings.enabled)
        setBaseURL(settings.baseURL)
        setModel(settings.model)
        setHasApiKey(settings.hasApiKey)
      })
      .catch(() => {})
    // This should load only once when the settings tab is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveSettings
      .runAsync(
        postJSON<LLMAssistantSettingsResponse>('/llm-assistant/settings', {
          body: {
            enabled,
            baseURL,
            model,
            apiKey: apiKey || undefined,
          },
        })
      )
      .then(settings => {
        setEnabled(settings.enabled)
        setBaseURL(settings.baseURL)
        setModel(settings.model)
        setHasApiKey(settings.hasApiKey)
        setApiKey('')
      })
      .catch(() => {})
  }

  const disabled = loadSettings.isLoading || saveSettings.isLoading

  return (
    <form className="llm-assistant-settings" onSubmit={handleSubmit}>
      <ToggleSetting
        id="llm-assistant-enabled"
        label={t('llm_assistant_enabled')}
        description={t('llm_assistant_enabled_description')}
        checked={enabled}
        onChange={setEnabled}
        disabled={disabled}
      />
      <Setting
        controlId="llm-assistant-base-url"
        label={t('llm_assistant_base_url')}
        description={t('llm_assistant_base_url_description')}
      >
        <OLFormControl
          id="llm-assistant-base-url"
          type="url"
          size="sm"
          value={baseURL}
          onChange={event => setBaseURL(event.target.value)}
          placeholder="https://api.openai.com/v1"
          disabled={disabled}
        />
      </Setting>
      <Setting
        controlId="llm-assistant-model"
        label={t('llm_assistant_model')}
        description={t('llm_assistant_model_description')}
      >
        <OLFormControl
          id="llm-assistant-model"
          type="text"
          size="sm"
          value={model}
          onChange={event => setModel(event.target.value)}
          placeholder="gpt-4o-mini"
          disabled={disabled}
        />
      </Setting>
      <Setting
        controlId="llm-assistant-api-key"
        label={t('llm_assistant_api_key')}
        description={
          hasApiKey
            ? t('llm_assistant_api_key_saved_description')
            : t('llm_assistant_api_key_description')
        }
      >
        <OLFormControl
          id="llm-assistant-api-key"
          type="password"
          size="sm"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
          placeholder={
            hasApiKey
              ? t('llm_assistant_api_key_saved_placeholder')
              : t('llm_assistant_api_key_placeholder')
          }
          autoComplete="off"
          disabled={disabled}
        />
      </Setting>
      <OLFormGroup className="llm-assistant-settings-actions">
        <OLButton
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || !baseURL.trim() || !model.trim()}
        >
          {saveSettings.isLoading ? t('saving') : t('save')}
        </OLButton>
      </OLFormGroup>
      {saveSettings.isSuccess && (
        <OLNotification type="success" content={t('thanks_settings_updated')} />
      )}
      {(saveSettings.isError || loadSettings.isError) && (
        <OLNotification
          type="error"
          content={
            getUserFacingMessage(saveSettings.error || loadSettings.error) ||
            t('generic_something_went_wrong')
          }
        />
      )}
    </form>
  )
}
