"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import type { InstructorProfile } from "@/lib/constants";

interface InstructorModalProps {
  instructor: InstructorProfile | null;
  onClose: () => void;
}

function ProfileList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <dt className="font-semibold text-slate-800">{title}</dt>
      <dd className="mt-1">
        <ul className="flex flex-col gap-1 text-slate-600">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

/** 강사 프로필 모달(PRD §5.1). 포커스 트랩·ESC·배경 클릭 닫힘은 ui/Modal이 담당 */
export function InstructorModal({ instructor, onClose }: InstructorModalProps) {
  const titleId = useId();

  return (
    <Modal open={!!instructor} onClose={onClose} titleId={titleId}>
      {instructor && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white"
              >
                {instructor.name.slice(0, 1)}
              </span>
              <div>
                <h2 id={titleId} className="text-xl font-bold text-slate-900">
                  {instructor.name} {instructor.title}
                </h2>
                {instructor.tagline && <p className="mt-0.5 text-sm text-accent">{instructor.tagline}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                &times;
              </span>
            </button>
          </div>

          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="font-semibold text-slate-800">소속</dt>
              <dd className="mt-0.5 text-slate-600">{instructor.affiliation}</dd>
            </div>
            {instructor.summary && (
              <div>
                <dt className="font-semibold text-slate-800">프로필</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-600">{instructor.summary}</dd>
              </div>
            )}
            <ProfileList title="전문 분야" items={instructor.specialties} />
            <ProfileList title="학력·자격" items={instructor.education} />
            <ProfileList title="주요 경력" items={instructor.career} />
            <ProfileList title="강의 이력" items={instructor.lectures} />
            <ProfileList title="연구 과제" items={instructor.research} />
            <ProfileList title="수상 이력" items={instructor.awards} />
            <ProfileList title="저서·발간물" items={instructor.publications} />
            <div className="rounded-lg bg-brand/5 p-3">
              <dt className="font-semibold text-brand">담당 세션</dt>
              <dd className="mt-0.5 text-slate-700">{instructor.assignment}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}
