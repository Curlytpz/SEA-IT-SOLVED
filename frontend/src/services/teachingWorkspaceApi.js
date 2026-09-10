import api from './api';

const data = response => response.data.data;

export async function getTeachingWorkspace() {
  return data(await api.get('/sections/instructor/teaching-workspace'));
}

export async function createTeachingFolder(name) {
  return data(await api.post('/sections/instructor/folders', { name }));
}

export async function renameTeachingFolder(folderId, name) {
  return data(await api.patch(`/sections/instructor/folders/${folderId}`, { name }));
}

export async function reorderTeachingFolders(folderIds) {
  return data(await api.patch('/sections/instructor/folders/reorder', { folderIds }));
}

export async function setTeachingFolderArchived(folderId, archived) {
  return data(await api.patch(`/sections/instructor/folders/${folderId}/archive`, { archived }));
}

export async function deleteTeachingFolder(folderId) {
  return data(await api.delete(`/sections/instructor/folders/${folderId}`));
}

export async function moveSectionToFolder(sectionId, folderId) {
  return data(await api.patch(`/sections/${sectionId}/folder`, { folderId }));
}
