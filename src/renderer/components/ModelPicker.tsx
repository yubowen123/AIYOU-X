import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Film, Image, MessageSquareText, Music2, Sparkles } from "lucide-react";
import type { ModelCategory, ModelDefinition, ProviderState } from "../../shared/types";
import { CATEGORY_LABELS } from "../../shared/modelCatalog";

const categoryIcons: Record<ModelCategory, typeof Film> = {
  video: Film,
  image: Image,
  text: MessageSquareText,
  audio: Music2,
  processing: Sparkles,
};

export function ModelPicker({
  value,
  models,
  providers,
  defaultModelId,
  onChange,
}: {
  value: string;
  models: ModelDefinition[];
  providers: ProviderState[];
  defaultModelId: string;
  onChange: (value: string) => void;
}) {
  const active = models.find((model) => model.id === value);
  const visibleProviders = providers.filter((provider) => provider.profile.enabled || provider.id === active?.providerId);
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="model-trigger" aria-label="选择模型">
        <span className="model-trigger__dot" data-category={active?.category ?? "agent"} />
        <Select.Value placeholder="选择模型" />
        <ChevronDown size={13} aria-hidden="true" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={8} align="center">
          <Select.Viewport className="select-viewport">
            <Select.Group>
              <Select.Label className="select-label">AIYOU Agent</Select.Label>
              <Select.Item value="codex" className="select-item">
                <Select.ItemText>Codex 默认 Agent</Select.ItemText>
                {defaultModelId === "codex" && <span className="select-item__badge">默认</span>}
                <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
              </Select.Item>
            </Select.Group>
            {visibleProviders.map((provider) => {
              const list = models.filter((model) => model.providerId === provider.id);
              if (!list.length) return null;
              return (
                <Select.Group key={provider.id}>
                  <Select.Separator className="select-separator" />
                  <Select.Label className="select-label">
                    <span>{provider.name}</span>
                    <small>{provider.configured ? "已连接" : "未配置"} · {list.length}</small>
                  </Select.Label>
                  {list.map((model) => {
                    const Icon = categoryIcons[model.category];
                    return (
                      <Select.Item key={model.id} value={model.id} className="select-item">
                        <Icon size={12} />
                        <Select.ItemText>{model.name}</Select.ItemText>
                        <span className="select-item__id">{model.id === defaultModelId ? "默认 · " : ""}{CATEGORY_LABELS[model.category]}</span>
                        <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
                      </Select.Item>
                    );
                  })}
                </Select.Group>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
