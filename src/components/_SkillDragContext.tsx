import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  exportSkill,
  importSkill,
  SkillTransferError,
} from '../api/skillTransfer';

export interface DraggingSkill {
  agentId: string;
  agentName: string;
  skillName: string;
  profile?: string;
}

export type CopyPhase = 'idle' | 'exporting' | 'importing' | 'done' | 'error';

interface SkillDragContextValue {
  dragging: DraggingSkill | null;
  setDragging: (d: DraggingSkill | null) => void;
  dropHoverAgentId: string | null;
  setDropHoverAgentId: (id: string | null) => void;
  copyPhase: CopyPhase;
  copyMessage: string;
  busy: boolean;
  /** Start copy after drop; handles same-agent, rename prompt via callback */
  handleDropOnAgent: (
    targetAgentId: string,
    targetAgentName: string,
    opts?: { askRename?: (name: string) => string | null | Promise<string | null> },
  ) => Promise<void>;
  clearCopyUi: () => void;
}

const SkillDragContext = createContext<SkillDragContextValue | null>(null);

export function useSkillDrag(): SkillDragContextValue {
  const ctx = useContext(SkillDragContext);
  if (!ctx) throw new Error('useSkillDrag outside provider');
  return ctx;
}

/** Optional hook when provider may be missing (shouldn't happen). */
export function useSkillDragOptional(): SkillDragContextValue | null {
  return useContext(SkillDragContext);
}

export function SkillDragProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<DraggingSkill | null>(null);
  const [dropHoverAgentId, setDropHoverAgentId] = useState<string | null>(null);
  const [copyPhase, setCopyPhase] = useState<CopyPhase>('idle');
  const [copyMessage, setCopyMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const clearCopyUi = useCallback(() => {
    setCopyPhase('idle');
    setCopyMessage('');
  }, []);

  const handleDropOnAgent = useCallback(
    async (
      targetAgentId: string,
      targetAgentName: string,
      opts?: { askRename?: (name: string) => string | null | Promise<string | null> },
    ) => {
      if (!dragging || busy) return;
      const src = dragging;
      setDragging(null);
      setDropHoverAgentId(null);

      if (src.agentId === targetAgentId) {
        setCopyPhase('error');
        setCopyMessage('Skill уже на этом агенте');
        return;
      }

      setBusy(true);
      setCopyPhase('exporting');
      setCopyMessage(`Export «${src.skillName}» с ${src.agentName}…`);

      try {
        const pkg = await exportSkill(src.agentId, src.skillName);
        setCopyPhase('importing');
        setCopyMessage(
          `Import «${pkg.name}» (${pkg.files.length} файлов) → ${targetAgentName}…`,
        );

        try {
          const result = await importSkill(targetAgentId, pkg);
          setCopyPhase('done');
          setCopyMessage(
            `Скопировано «${result.name}» → ${targetAgentName} (${result.fileCount} файлов)`,
          );
          await queryClient.invalidateQueries({ queryKey: ['skills', targetAgentId] });
          await queryClient.invalidateQueries({ queryKey: ['fleet'] });
        } catch (e1) {
          if (e1 instanceof SkillTransferError && e1.status === 409) {
            const suggested = `${src.skillName}-copy`;
            const renamed = opts?.askRename
              ? await opts.askRename(suggested)
              : window.prompt(
                  `Skill «${src.skillName}» уже есть на ${targetAgentName}.\nНовое имя (Cancel = отмена):`,
                  suggested,
                );
            if (!renamed || !renamed.trim()) {
              setCopyPhase('error');
              setCopyMessage('Копирование отменено');
              return;
            }
            const result = await importSkill(targetAgentId, pkg, renamed.trim());
            setCopyPhase('done');
            setCopyMessage(
              `Скопировано как «${result.name}» → ${targetAgentName} (${result.fileCount} файлов)`,
            );
            await queryClient.invalidateQueries({ queryKey: ['skills', targetAgentId] });
            await queryClient.invalidateQueries({ queryKey: ['fleet'] });
          } else {
            throw e1;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        let extra = '';
        if (e instanceof SkillTransferError) {
          if (e.cleanupFailed) extra = ' · cleanup на target не удался — проверьте вручную';
          else if (e.cleanedUp) extra = ' · partial skill удалён с target';
        }
        setCopyPhase('error');
        setCopyMessage(`Ошибка: ${msg}${extra}`);
      } finally {
        setBusy(false);
      }
    },
    [dragging, busy, queryClient],
  );

  const value = useMemo(
    () => ({
      dragging,
      setDragging,
      dropHoverAgentId,
      setDropHoverAgentId,
      copyPhase,
      copyMessage,
      busy,
      handleDropOnAgent,
      clearCopyUi,
    }),
    [
      dragging,
      dropHoverAgentId,
      copyPhase,
      copyMessage,
      busy,
      handleDropOnAgent,
      clearCopyUi,
    ],
  );

  return (
    <SkillDragContext.Provider value={value}>
      {children}
      {(copyPhase === 'exporting' ||
        copyPhase === 'importing' ||
        copyPhase === 'done' ||
        copyPhase === 'error') && (
        <div className={`skill-copy-toast skill-copy-toast--${copyPhase}`} role="status">
          <div className="skill-copy-toast-body">
            {(copyPhase === 'exporting' || copyPhase === 'importing') && (
              <span className="skill-copy-spinner" aria-hidden />
            )}
            <span>{copyMessage}</span>
            {(copyPhase === 'done' || copyPhase === 'error') && (
              <button type="button" className="skill-copy-toast-close" onClick={clearCopyUi}>
                OK
              </button>
            )}
          </div>
        </div>
      )}
    </SkillDragContext.Provider>
  );
}
