import * as Dialog from "@radix-ui/react-dialog";
import { ShieldAlert, X } from "lucide-react";
import type { ApprovalRequest } from "../../shared/types";

export function ApprovalDialog({
  request,
  onResolve,
}: {
  request: ApprovalRequest | null;
  onResolve: (accepted: boolean) => void;
}) {
  return (
    <Dialog.Root open={Boolean(request)} onOpenChange={(open) => !open && onResolve(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="approval-dialog">
          <div className="approval-icon"><ShieldAlert size={22} /></div>
          <Dialog.Title>Agent 请求审批</Dialog.Title>
          <Dialog.Description>AIYOU 在执行下列操作前等待你的决定。</Dialog.Description>
          <div className="approval-method">{request?.method}</div>
          <pre>{JSON.stringify(request?.params ?? {}, null, 2)}</pre>
          <div className="button-row end">
            <button className="button secondary" onClick={() => onResolve(false)}>拒绝</button>
            <button className="button primary" onClick={() => onResolve(true)}>允许本次</button>
          </div>
          <button className="approval-close" onClick={() => onResolve(false)} aria-label="关闭"><X size={16} /></button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
