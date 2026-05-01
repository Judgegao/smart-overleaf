import MaterialIcon from '@/shared/components/material-icon'

export default function LLMAssistantIcon({
  title,
}: {
  open: boolean
  title: string
}) {
  return (
    <MaterialIcon
      type="auto_awesome"
      className="ide-rail-tab-link-icon"
      accessibilityLabel={title}
    />
  )
}
