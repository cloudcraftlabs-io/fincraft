<template>
  <Drawer
    :show="true"
    width="auto"
    @update:show="(show: boolean) => !show && $emit('close')"
  >
    <DrawerContent
      :title="panelTitle"
      :closable="true"
      class="w-[72rem] max-w-[100vw] relative"
    >
      <div class="w-full flex flex-row justify-end items-center">
        <NButton type="primary" @click="state.showAddMemberPanel = true">{{
          $t("project.members.grant-access")
        }}</NButton>
      </div>
      <div v-for="role in roleList" :key="role.role" class="mb-4">
        <template v-if="role.singleBindingList.length > 0">
          <div
            class="w-full px-2 py-2 flex flex-row justify-start items-center"
          >
            <span class="textlabel">{{ displayRoleTitle(role.role) }}</span>
            <NTooltip
              v-if="allowAdmin"
              :disabled="
                allowRemoveRole(role.role) ||
                role.role !== PresetRoleType.PROJECT_OWNER
              "
            >
              <template #trigger>
                <NButton
                  tag="div"
                  text
                  class="cursor-pointer opacity-60 hover:opacity-100"
                  :disabled="!allowRemoveRole(role.role)"
                  @click="handleDeleteRole(role.role)"
                >
                  <heroicons-outline:trash class="w-4 h-4 ml-1" />
                </NButton>
              </template>
              <div>
                {{ $t("project.members.cannot-remove-last-owner") }}
              </div>
            </NTooltip>
          </div>
          <BBGrid
            :column-list="getGridColumns(role.role)"
            :row-clickable="false"
            :data-source="role.singleBindingList"
            class="border"
          >
            <template #item="{ item }: SingleBindingRow">
              <div class="bb-grid-cell">
                <span
                  class="text-blue-600 cursor-pointer hover:opacity-80"
                  @click="editingBinding = item.rawBinding"
                >
                  {{
                    item.rawBinding.condition?.title ||
                    displayRoleTitle(item.rawBinding.role)
                  }}
                </span>
              </div>
              <template
                v-if="isRoleShouldShowDatabaseRelatedColumns(role.role)"
              >
                <div class="bb-grid-cell">
                  <span class="shrink-0 mr-1">{{
                    extractDatabaseName(item.databaseResource)
                  }}</span>
                  <template v-if="item.databaseResource">
                    <InstanceV1Name
                      class="text-gray-500"
                      :instance="
                        extractDatabase(item.databaseResource).instanceEntity
                      "
                      :link="false"
                    />
                  </template>
                </div>
                <div class="bb-grid-cell">
                  {{ extractSchemaName(item.databaseResource) }}
                </div>
                <div class="bb-grid-cell">
                  {{ extractTableName(item.databaseResource) }}
                </div>
              </template>
              <div class="bb-grid-cell">
                {{ extractExpiration(item.expiration) }}
                <RoleExpiredTip v-if="checkRoleExpired(item)" />
              </div>
              <div class="bb-grid-cell">
                <RoleDescription :description="item.description || ''" />
              </div>
              <div class="bb-grid-cell space-x-1">
                <NTooltip v-if="allowAdmin" trigger="hover">
                  <template #trigger>
                    <NButton
                      tag="div"
                      text
                      class="cursor-pointer opacity-60 hover:opacity-100"
                      :disabled="!allowDeleteCondition(item)"
                      @click="handleDeleteCondition(item)"
                    >
                      <heroicons-outline:trash class="w-4 h-4" />
                    </NButton>
                  </template>
                  <template #default>
                    <template v-if="!allowDeleteCondition(item)">
                      {{ $t("project.members.cannot-remove-last-owner") }}
                    </template>
                    <template v-else>
                      {{ $t("common.delete") }}
                    </template>
                  </template>
                </NTooltip>
              </div>
            </template>
          </BBGrid>
        </template>
      </div>
      <template #footer>
        <div class="w-full flex flex-row justify-between items-center">
          <div>
            <BBButtonConfirm
              :style="'DELETE'"
              :button-text="$t('project.members.revoke-member')"
              :require-confirm="true"
              @confirm="handleDeleteMember"
            />
          </div>
          <div class="flex items-center justify-end gap-x-2">
            <NButton @click="$emit('close')">{{ $t("common.cancel") }}</NButton>
            <NButton type="primary" @click="$emit('close')">
              {{ $t("common.ok") }}
            </NButton>
          </div>
        </div>
      </template>
    </DrawerContent>
  </Drawer>

  <EditProjectRolePanel
    v-if="editingBinding"
    :project="project"
    :binding="editingBinding"
    @close="editingBinding = null"
  />

  <AddProjectMembersPanel
    v-if="state.showAddMemberPanel"
    :project="project"
    :bindings="[
      Binding.fromPartial({
        members: [getUserEmailInBinding(member.user.email)],
      }),
    ]"
    @close="state.showAddMemberPanel = false"
  />
</template>

<script lang="ts" setup>
import { cloneDeep, isEqual, uniqBy } from "lodash-es";
import { NButton, NTooltip, useDialog } from "naive-ui";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { BBGrid, BBGridRow } from "@/bbkit";
import { Drawer, DrawerContent, InstanceV1Name } from "@/components/v2";
import {
  useCurrentUserV1,
  useDatabaseV1Store,
  useProjectIamPolicy,
  useProjectIamPolicyStore,
  useUserStore,
} from "@/store";
import {
  ComposedProject,
  DatabaseResource,
  getUserEmailInBinding,
  PresetRoleType,
  ProjectLevelRoles,
} from "@/types";
import { User } from "@/types/proto/v1/auth_service";
import { State } from "@/types/proto/v1/common";
import { Binding } from "@/types/proto/v1/iam_policy";
import {
  displayRoleTitle,
  hasPermissionInProjectV1,
  hasWorkspacePermissionV1,
} from "@/utils";
import {
  convertFromExpr,
  stringifyConditionExpression,
} from "@/utils/issue/cel";
import EditProjectRolePanel from "../ProjectRoleTable/EditProjectRolePanel.vue";
import RoleDescription from "./RoleDescription.vue";
import RoleExpiredTip from "./RoleExpiredTip.vue";
import { ComposedProjectMember, SingleBinding } from "./types";

export type SingleBindingRow = BBGridRow<SingleBinding>;

interface LocalState {
  showAddMemberPanel: boolean;
}

const props = defineProps<{
  project: ComposedProject;
  member: ComposedProjectMember;
}>();

const emits = defineEmits<{
  (event: "close"): void;
}>();

const { t } = useI18n();
const dialog = useDialog();
const currentUserV1 = useCurrentUserV1();
const userStore = useUserStore();
const databaseStore = useDatabaseV1Store();
const projectIamPolicyStore = useProjectIamPolicyStore();
const projectResourceName = computed(() => props.project.name);
const { policy: iamPolicy } = useProjectIamPolicy(projectResourceName);
const state = reactive<LocalState>({
  showAddMemberPanel: false,
});
const roleList = ref<
  {
    role: string;
    singleBindingList: SingleBinding[];
  }[]
>([]);
const editingBinding = ref<Binding | null>(null);

const panelTitle = computed(() => {
  return t("project.members.edit", {
    member: `${props.member.user.title}(${props.member.user.email})`,
  });
});

const isRoleShouldShowDatabaseRelatedColumns = (role: string) => {
  return (
    role === PresetRoleType.PROJECT_QUERIER ||
    role === PresetRoleType.PROJECT_EXPORTER
  );
};

const getGridColumns = (role: string) => {
  const placeholder = {
    title: "",
    width: "2rem",
  };
  const conditionName = {
    title: t("project.members.condition-name"),
    width: "minmax(min-content, auto)",
  };
  const databaseRelatedColumns = [
    {
      title: t("common.database"),
      width: "minmax(min-content, auto)",
    },
    {
      title: t("common.schema"),
      width: "minmax(min-content, auto)",
    },
    {
      title: t("common.table"),
      width: "minmax(min-content, auto)",
    },
  ];
  const expiration = {
    title: t("common.expiration"),
    width: "minmax(min-content, auto)",
  };
  const description = {
    title: t("common.description"),
    width: "minmax(min-content, auto)",
  };
  if (isRoleShouldShowDatabaseRelatedColumns(role)) {
    return [
      conditionName,
      ...databaseRelatedColumns,
      expiration,
      description,
      placeholder,
    ];
  } else {
    return [conditionName, expiration, description, placeholder];
  }
};

const allowAdmin = computed(() => {
  if (
    hasWorkspacePermissionV1(
      "bb.permission.workspace.manage-project",
      currentUserV1.value.userRole
    )
  ) {
    return true;
  }

  if (
    hasPermissionInProjectV1(
      iamPolicy.value,
      currentUserV1.value,
      "bb.permission.project.manage-member"
    )
  ) {
    return true;
  }

  return false;
});

// To prevent user accidentally removing roles and lock the project permanently, we take following measures:
// 1. Disallow removing the last OWNER.
// 2. Allow workspace roles who can manage project. This helps when the project OWNER is no longer available.
const allowRemoveRole = (role: string) => {
  if (props.project.state === State.DELETED) {
    return false;
  }

  if (role === PresetRoleType.PROJECT_OWNER) {
    const ownerBindings = iamPolicy.value.bindings.filter(
      (binding) => binding.role === PresetRoleType.PROJECT_OWNER
    );
    const members: User[] = [];
    // Find those never expires owner members.
    for (const binding of ownerBindings) {
      if (binding.condition?.expression !== "") {
        continue;
      }
      members.push(
        ...((binding?.members || [])
          .map((userIdentifier) => {
            return userStore.getUserByIdentifier(userIdentifier);
          })
          .filter((user) => user && user.state === State.ACTIVE) as User[])
      );
    }
    // If there is only one owner, disallow removing.
    if (uniqBy(members, "email").length <= 1) {
      return false;
    }
  }

  return allowAdmin.value;
};

const handleDeleteRole = (role: string) => {
  const title = t("project.members.revoke-role-from-user", {
    role: displayRoleTitle(role),
    user: props.member.user.title,
  });
  dialog.create({
    title: title,
    content: t("common.cannot-undo-this-action"),
    positiveText: t("common.revoke"),
    negativeText: t("common.cancel"),
    onPositiveClick: async () => {
      const user = getUserEmailInBinding(props.member.user.email);
      const policy = cloneDeep(iamPolicy.value);
      for (const binding of policy.bindings) {
        if (binding.role !== role) {
          continue;
        }
        if (binding.members.includes(user)) {
          binding.members = binding.members.filter((member) => {
            return member !== user;
          });
        }
        if (binding.members.length === 0) {
          policy.bindings = policy.bindings.filter(
            (item) => !isEqual(item, binding)
          );
        }
      }
      await projectIamPolicyStore.updateProjectIamPolicy(
        projectResourceName.value,
        policy
      );
    },
  });
};

const allowDeleteCondition = (singleBinding: SingleBinding) => {
  if (singleBinding.rawBinding.role === PresetRoleType.PROJECT_OWNER) {
    return allowRemoveRole(PresetRoleType.PROJECT_OWNER);
  }
  return true;
};

const handleDeleteCondition = async (singleBinding: SingleBinding) => {
  const conditionName =
    singleBinding.rawBinding.condition?.title ||
    displayRoleTitle(singleBinding.rawBinding.role);
  const title = t("project.members.revoke-role-from-user", {
    role: conditionName,
    user: props.member.user.title,
  });

  dialog.create({
    title: title,
    content: t("common.cannot-undo-this-action"),
    positiveText: t("common.revoke"),
    negativeText: t("common.cancel"),
    onPositiveClick: async () => {
      const user = getUserEmailInBinding(props.member.user.email);
      const policy = cloneDeep(iamPolicy.value);
      const rawBinding = policy.bindings.find((binding) =>
        isEqual(binding, singleBinding.rawBinding)
      );
      if (!rawBinding) {
        return;
      }

      rawBinding.members = rawBinding.members.filter((member) => {
        return member !== user;
      });

      if (rawBinding.members.length === 0) {
        policy.bindings = policy.bindings.filter(
          (binding) => !isEqual(binding, rawBinding)
        );
      } else {
        if (rawBinding.parsedExpr?.expr) {
          const conditionExpr = convertFromExpr(rawBinding.parsedExpr.expr);
          if (conditionExpr.databaseResources) {
            conditionExpr.databaseResources =
              conditionExpr.databaseResources.filter(
                (resource) => !isEqual(resource, singleBinding.databaseResource)
              );
            if (conditionExpr.databaseResources.length !== 0) {
              const newBinding = cloneDeep(rawBinding);
              newBinding.members = [user];
              newBinding.condition!.expression =
                stringifyConditionExpression(conditionExpr);
              policy.bindings.push(newBinding);
            }
          }
        }
      }

      await projectIamPolicyStore.updateProjectIamPolicy(
        projectResourceName.value,
        policy
      );
    },
  });
};

const handleDeleteMember = async () => {
  const user = getUserEmailInBinding(props.member.user.email);
  const policy = cloneDeep(iamPolicy.value);
  for (const binding of policy.bindings) {
    binding.members = binding.members.filter((member) => {
      return member !== user;
    });
  }
  policy.bindings = policy.bindings.filter(
    (binding) => binding.members.length > 0
  );
  await projectIamPolicyStore.updateProjectIamPolicy(
    projectResourceName.value,
    policy
  );
};

const extractDatabaseName = (databaseResource?: DatabaseResource) => {
  if (!databaseResource) {
    return "*";
  }
  const database = databaseStore.getDatabaseByName(
    String(databaseResource.databaseName)
  );
  return database.databaseName;
};

const extractDatabase = (databaseResource: DatabaseResource) => {
  const database = databaseStore.getDatabaseByName(
    String(databaseResource.databaseName)
  );
  return database;
};

const extractSchemaName = (databaseResource?: DatabaseResource) => {
  if (!databaseResource) {
    return "*";
  }

  if (databaseResource.schema === undefined) {
    return "*";
  } else if (databaseResource.schema === "") {
    return "-";
  } else {
    return databaseResource.schema;
  }
};

const extractTableName = (databaseResource?: DatabaseResource) => {
  if (!databaseResource) {
    return "*";
  }

  if (databaseResource.table === undefined) {
    return "*";
  } else if (databaseResource.table === "") {
    return "-";
  } else {
    return databaseResource.table;
  }
};

const extractExpiration = (expiration?: Date) => {
  if (!expiration) {
    return t("project.members.never-expires");
  }
  return expiration.toLocaleString();
};

const checkRoleExpired = (role: SingleBinding) => {
  if (!role.expiration) {
    return false;
  }
  return role.expiration < new Date();
};

watch(
  () => [iamPolicy.value?.bindings],
  async () => {
    const tempRoleList: {
      role: string;
      singleBindingList: SingleBinding[];
    }[] = [];
    const rawBindingList = iamPolicy.value?.bindings?.filter((binding) => {
      return binding.members.includes(
        getUserEmailInBinding(props.member.user.email)
      );
    });
    for (const rawBinding of rawBindingList) {
      const singleBindingList = [];
      const singleBinding: SingleBinding = {
        databaseResource: undefined,
        expiration: undefined,
        description: undefined,
        rawBinding: rawBinding,
      };

      if (rawBinding.parsedExpr?.expr) {
        const conditionExpr = convertFromExpr(rawBinding.parsedExpr.expr);
        singleBinding.description = rawBinding.condition?.description || "";
        if (conditionExpr.expiredTime) {
          singleBinding.expiration = new Date(conditionExpr.expiredTime);
        }
        if (
          Array.isArray(conditionExpr.databaseResources) &&
          conditionExpr.databaseResources.length > 0
        ) {
          for (const resource of conditionExpr.databaseResources) {
            singleBindingList.push({
              ...singleBinding,
              databaseResource: resource,
            });
          }
        } else {
          singleBindingList.push(singleBinding);
        }
      } else {
        singleBindingList.push(singleBinding);
      }

      const tempRole = tempRoleList.find(
        (role) => role.role === rawBinding.role
      );
      if (tempRole) {
        tempRole.singleBindingList.push(...singleBindingList);
      } else {
        tempRoleList.push({
          role: rawBinding.role,
          singleBindingList: singleBindingList,
        });
      }
    }
    if (tempRoleList.length === 0) {
      emits("close");
    }

    // Sort by role type.
    tempRoleList.sort((a, b) => {
      if (!ProjectLevelRoles.includes(a.role)) return -1;
      if (!ProjectLevelRoles.includes(b.role)) return 1;
      return (
        ProjectLevelRoles.indexOf(a.role) - ProjectLevelRoles.indexOf(b.role)
      );
    });
    roleList.value = tempRoleList;
  },
  {
    immediate: true,
  }
);
</script>
