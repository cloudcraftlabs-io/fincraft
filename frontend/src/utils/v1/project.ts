import { orderBy, uniq } from "lodash-es";
import { extractUserEmail, useUserStore } from "@/store";
import {
  ALL_USERS_USER_EMAIL,
  DEFAULT_PROJECT_V1_NAME,
  UNKNOWN_ID,
  PresetRoleType,
} from "@/types";
import { User } from "@/types/proto/v1/auth_service";
import { State } from "@/types/proto/v1/common";
import { IamPolicy } from "@/types/proto/v1/iam_policy";
import { Project } from "@/types/proto/v1/project_service";
import {
  extractRoleResourceName,
  hasProjectPermission,
  ProjectPermissionType,
} from "../role";

export const extractProjectResourceName = (name: string) => {
  const pattern = /(?:^|\/)projects\/([^/]+)(?:$|\/)/;
  const matches = name.match(pattern);
  return matches?.[1] ?? "";
};

export const hasPermissionInProjectV1 = (
  policy: IamPolicy,
  user: User,
  permission: ProjectPermissionType
) => {
  return policy.bindings.some((binding) => {
    if (binding.members.includes(`user:${user.email}`)) {
      return hasProjectPermission(
        permission,
        extractRoleResourceName(binding.role)
      );
    }
    return false;
  });
};

export const roleListInProjectV1 = (iamPolicy: IamPolicy, user: User) => {
  return iamPolicy.bindings
    .filter((binding) => {
      return (
        binding.members.includes(`user:${user.email}`) ||
        binding.members.includes(ALL_USERS_USER_EMAIL)
      );
    })
    .map((binding) => binding.role);
};

export const isMemberOfProjectV1 = (iamPolicy: IamPolicy, user: User) => {
  return roleListInProjectV1(iamPolicy, user).length > 0;
};

export const isOwnerOfProjectV1 = (iamPolicy: IamPolicy, user: User) => {
  return roleListInProjectV1(iamPolicy, user).includes(
    PresetRoleType.PROJECT_OWNER
  );
};

export const isDeveloperOfProjectV1 = (iamPolicy: IamPolicy, user: User) => {
  return roleListInProjectV1(iamPolicy, user).includes(
    PresetRoleType.PROJECT_DEVELOPER
  );
};

export const isViewerOfProjectV1 = (iamPolicy: IamPolicy, user: User) => {
  return roleListInProjectV1(iamPolicy, user).includes(
    PresetRoleType.PROJECT_VIEWER
  );
};

export const memberListInProjectV1 = (
  project: Project,
  iamPolicy: IamPolicy
) => {
  const userStore = useUserStore();

  const distinctEmailList = uniq(
    iamPolicy.bindings.flatMap((binding) =>
      binding.members.map(extractUserEmail)
    )
  );
  const userList = distinctEmailList.map((email) => {
    const user =
      userStore.getUserByEmail(email) ??
      User.fromJSON({
        name: `users/${UNKNOWN_ID}`,
        email,
        title: "<<Unknown user>>",
      });
    return user;
  });
  const usersByRole = iamPolicy.bindings.map((binding) => {
    return {
      role: binding.role,
      emailList: new Set(binding.members.map(extractUserEmail)),
    };
  });
  const composedUserList = userList.map((user) => {
    const roleList = usersByRole
      .filter((binding) => binding.emailList.has(user.email))
      .map((binding) => binding.role);
    return { user, roleList };
  });

  return orderBy(
    composedUserList,
    [
      (item) => (item.roleList.includes(PresetRoleType.PROJECT_OWNER) ? 0 : 1),
      (item) => item.user.email,
    ],
    ["asc", "asc"]
  );
};

export function projectV1Name(project: Project) {
  if (project.name === DEFAULT_PROJECT_V1_NAME) {
    return "Unassigned";
  }

  const parts = [project.title];
  if (project.state === State.DELETED) {
    parts.push("(Archived)");
  }
  return parts.join(" ");
}

export function filterProjectV1ListByKeyword<T extends Project>(
  projectList: T[],
  keyword: string
) {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return projectList;
  return projectList.filter((project) => {
    return (
      project.title.toLowerCase().includes(keyword) ||
      project.key.toLowerCase().includes(keyword)
    );
  });
}
