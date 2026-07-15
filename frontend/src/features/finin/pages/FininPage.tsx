import FininApp from '../app/FininApp';
import { ProjectsPage } from '../../setup/components/ProjectsPage';
import type { SourceConnection } from '../../setup/types';

interface Props {
  connections: SourceConnection[];
  projectId: string | null;
  onOpenProject: (projectId: string, projectName: string) => void;
  initialConnectionName?: string | null;
  onMappingSaved?: () => void;
}

/**
 * Top-level "Finin" nav section. Runs the full FininMapper application
 * in-place; if no Fabric project is open yet it nudges the user to pick
 * one first (so there's a Config_<connection> schema to save mappings into).
 */
export const FininPage = ({ connections, projectId, onOpenProject, initialConnectionName, onMappingSaved }: Props) => {
  if (!projectId) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-amber-200 bg-amber-50 rounded-xl px-5 py-4 text-sm text-amber-800">
          Open a Fabric project below, then come back to Finin — mappings save into that
          project's <code>SourceInformationSchemaMapped</code> table.
        </div>
        <ProjectsPage appType="finin" onOpenProject={onOpenProject} />
      </div>
    );
  }

  return (
    <FininApp
      connections={connections}
      projectId={projectId}
      initialConnectionName={initialConnectionName}
      onMappingSaved={onMappingSaved}
    />
  );
};