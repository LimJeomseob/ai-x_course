"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { LookupResultItem } from "@/lib/types";

interface CancelConfirmModalProps {
  item: LookupResultItem | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelConfirmModal({ item, loading, onConfirm, onClose }: CancelConfirmModalProps) {
  const titleId = useId();
  return (
    <Modal open={!!item} onClose={onClose} titleId={titleId}>
      {item && (
        <div className="flex flex-col gap-5">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            신청을 취소하시겠습니까?
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            <strong>
              {item.dayLabel} {item.roundLabel} · {item.topic}
            </strong>{" "}
            세션 신청을 취소합니다. 취소 후 자리는 즉시 반환되며, 같은 날 다른 세션 신청에는 영향이 없습니다.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              돌아가기
            </Button>
            <Button type="button" variant="danger" onClick={onConfirm} disabled={loading}>
              {loading ? "취소 처리 중..." : "신청 취소"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
