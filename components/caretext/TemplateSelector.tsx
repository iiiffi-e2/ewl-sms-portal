type Template = {
  id: string;
  title: string;
  body: string;
};

type TemplateSelectorProps = {
  templates: Template[];
  onChoose: (templateBody: string) => void;
};

export function TemplateSelector({ templates, onChoose }: TemplateSelectorProps) {
  return (
    <select
      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
      defaultValue=""
      onChange={(event) => {
        const selectedId = event.target.value;
        const template = templates.find((item) => item.id === selectedId);
        if (template) {
          onChoose(template.body);
        }
      }}
    >
      <option value="">Insert template...</option>
      {templates.map((template) => (
        <option key={template.id} value={template.id}>
          {template.title}
        </option>
      ))}
    </select>
  );
}
