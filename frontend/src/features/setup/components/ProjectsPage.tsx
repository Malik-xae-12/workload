/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, FolderKanban, Trash2, ArrowRight, Loader2, Settings, AlertTriangle, X } from 'lucide-react';
import {
  listProjects,
  createProject,
  deleteProject,
  type ProjectResponse,
} from '../../../layouts/services/fabricApi';

interface ProjectsPageProps {
  onOpenProject: (projectId: string, projectName: string) => void;
  /** Which accelerator's projects to show/create — Fabric and Finin projects
   * are fully isolated from each other. */
  appType?: 'fabric' | 'finin';
}

export const ProjectsPage = ({ onOpenProject, appType = 'fabric' }: ProjectsPageProps) => {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Project pending an explicit delete confirmation — nothing is deleted
  // just from clicking the trash icon anymore; that only opens this modal.
  const [projectToDelete, setProjectToDelete] = useState<ProjectResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects(appType);
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [appType]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await createProject({ name: newName.trim(), description: newDesc.trim() || undefined, app_type: appType });
      setNewName('');
      setNewDesc('');
      await fetchProjects();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteProject(id);
      await fetchProjects();
      setProjectToDelete(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-3 px-2">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Projects</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Create a new project or continue setting up an existing one.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Create Project Form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div
            className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
            style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
          >
            <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
              <Plus size={13} className="text-white" />
            </div>
            <span className="text-[12px] font-semibold text-slate-700">New Project</span>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Project Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Project Name"
                className="w-full h-10 px-3.5 text-sm rounded-lg border border-slate-300 outline-none bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional project description"
                className="w-full h-10 px-3.5 text-sm rounded-lg border border-slate-300 outline-none bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-all"
              style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Project
            </button>
          </div>
        </div>

        {/* Right: Project List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div
            className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
            style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
          >
            <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
              <FolderKanban size={13} className="text-white" />
            </div>
            <span className="text-[12px] font-semibold text-slate-700">Your Projects</span>
            <span className="ml-auto text-[10px] font-bold text-slate-400">{projects.length} total</span>
          </div>

          {loading && projects.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16">
              <FolderKanban size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 mb-1">No projects yet</p>
              <p className="text-xs text-slate-400">Create your first project to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <FolderKanban size={16} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{project.description}</p>
                    )}
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                      {project.status}
                    </span>
                  </div>
                  <button
                    onClick={() => onOpenProject(project.id, project.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-all"
                    style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
                  >
                    <Settings size={12} /> Setup <ArrowRight size={12} />
                  </button>
                  <button
                    onClick={() => setProjectToDelete(project)}
                    className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {projectToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          onClick={() => !deleting && setProjectToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">Delete project?</h3>
                  <p className="text-[13px] text-slate-500 mt-1">
                    This will permanently delete <span className="font-semibold text-slate-700">{projectToDelete.name}</span> and
                    all of its setup progress. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setProjectToDelete(null)}
                  disabled={deleting}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setProjectToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-[13px] font-semibold text-slate-600 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(projectToDelete.id)}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white rounded-lg bg-rose-600 hover:bg-rose-700 transition-all disabled:opacity-60"
              >
                {deleting ? (
                  <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                ) : (
                  <><Trash2 size={13} /> Delete Project</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};