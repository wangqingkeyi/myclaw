export interface Group {
  id: string;
  name: string;
}

export interface GroupManager {
  list(): Promise<Group[]>;
}

export const createGroupManager = (): GroupManager => ({
  async list() {
    return [];
  }
});
