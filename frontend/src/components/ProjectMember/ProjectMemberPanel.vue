<template>
  <div class="w-full mx-auto space-y-4">
    <FeatureAttention feature="bb.feature.rbac" />

    <div v-if="allowAdmin" class="flex justify-end gap-x-2">
      <NButton
        v-if="state.selectedTab === 'users'"
        :disabled="state.selectedMemberNameList.size === 0"
        @click="handleRevokeSelectedMembers"
      >
        {{ $t("project.members.revoke-access") }}
      </NButton>
      <NButton type="primary" @click="state.showAddMemberPanel = true">
        <template #icon>
          <heroicons-outline:user-add class="w-4 h-4" />
        </template>
        {{ $t("project.members.grant-access") }}
      </NButton>
    </div>

    <div class="textinfolabel">
      {{ $t("project.members.description") }}
      <a
        href="https://www.bytebase.com/docs/concepts/roles-and-permissions/#project-roles?source=console"
        target="_blank"
        class="normal-link inline-flex flex-row items-center"
      >
        {{ $t("common.learn-more") }}
        <heroicons-outline:external-link class="w-4 h-4" />
      </a>
    </div>

    <NTabs v-model:value="state.selectedTab" type="bar">
      <template #suffix>
        <SearchBox
          v-model:value="state.searchText"
          :placeholder="$t('project.members.search-member')"
        />
      </template>
      <NTabPane name="users" :tab="$t('project.members.users')">
        <ProjectMemberTable
          :project="project"
          :ready="ready"
          :editable="true"
          :member-list="renderedComposedMemberList"
          :show-selection-column="allowAdmin"
        >
          <template #selection-all="{ memberList }">
            <NCheckbox
              v-if="renderedComposedMemberList.length > 0"
              v-bind="getAllSelectionState(memberList)"
              @update:checked="toggleAllMembersSelection(memberList, $event)"
            />
          </template>
          <template #selection="{ member }">
            <NCheckbox
              :checked="isMemeberSelected(member)"
              @update:checked="
                (checked) => toggleMemberSelection(member, checked)
              "
            />
          </template>
        </ProjectMemberTable>

        <div v-if="inactiveComposedMemberList.length > 0" class="mt-4 ml-2">
          <NCheckbox v-model:checked="state.showInactiveMemberList">
            <span class="textinfolabel">
              {{ $t("project.members.show-inactive") }}
            </span>
          </NCheckbox>
        </div>

        <div v-if="state.showInactiveMemberList" class="my-4 space-y-2">
          <div class="text-lg font-medium leading-7 text-main">
            <span>{{ $t("project.members.inactive-members") }}</span>
            <span class="ml-1 font-normal text-control-light">
              ({{ inactiveComposedMemberList.length }})
            </span>
          </div>
          <ProjectMemberTable
            :project="project"
            :ready="ready"
            :editable="false"
            :member-list="inactiveComposedMemberList"
          />
        </div>
      </NTabPane>
      <NTabPane name="roles" :tab="$t('project.members.roles')">
        <ProjectRoleTable
          :project="project"
          :search-text="state.searchText"
          :ready="ready"
        />
      </NTabPane>
    </NTabs>

    <BBButtonConfirm
      v-if="allowRemoveExpiredRoles"
      :style="'DELETE'"
      :button-text="$t('project.members.clean-up-expired-roles')"
      :require-confirm="true"
      @confirm="handleRemoveExpiredRoles"
    />
  </div>

  <AddProjectMembersPanel
    v-if="state.showAddMemberPanel"
    :project="project"
    @close="state.showAddMemberPanel = false"
  />
</template>

<script lang="ts" setup>
import { cloneDeep, orderBy, uniq } from "lodash-es";
import { NButton, NCheckbox, NTabs, NTabPane, useDialog } from "naive-ui";
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import {
  extractUserEmail,
  pushNotification,
  useCurrentUserV1,
  useProjectIamPolicy,
  useProjectIamPolicyStore,
  useUserStore,
} from "@/store";
import {
  ComposedProject,
  DEFAULT_PROJECT_V1_NAME,
  getUserEmailInBinding,
  unknownUser,
  PresetRoleType,
} from "@/types";
import { State } from "@/types/proto/v1/common";
import {
  extractUserUID,
  hasPermissionInProjectV1,
  hasWorkspacePermissionV1,
} from "@/utils";
import { convertFromExpr } from "@/utils/issue/cel";
import AddProjectMembersPanel from "./AddProjectMember/AddProjectMembersPanel.vue";
import ProjectMemberTable, {
  ComposedProjectMember,
} from "./ProjectMemberTable";
import ProjectRoleTable from "./ProjectRoleTable";
import { getExpiredDateTime } from "./ProjectRoleTable/utils";

interface LocalState {
  searchText: string;
  selectedTab: "users" | "roles";
  selectedMemberNameList: Set<string>;
  showInactiveMemberList: boolean;
  showAddMemberPanel: boolean;
}

const props = defineProps<{
  project: ComposedProject;
}>();

const { t } = useI18n();
const dialog = useDialog();
const currentUserV1 = useCurrentUserV1();
const projectResourceName = computed(() => props.project.name);
const { policy: iamPolicy, ready } = useProjectIamPolicy(projectResourceName);

const state = reactive<LocalState>({
  searchText: "",
  selectedTab: "users",
  selectedMemberNameList: new Set(),
  showInactiveMemberList: false,
  showAddMemberPanel: false,
});

const userStore = useUserStore();

const allowAdmin = computed(() => {
  if (props.project.name === DEFAULT_PROJECT_V1_NAME) {
    return false;
  }

  if (props.project.state === State.DELETED) {
    return false;
  }

  // Allow workspace roles having manage project permission here in case project owners are not available.
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

const allowRemoveExpiredRoles = computed(() => {
  for (const binding of iamPolicy.value.bindings) {
    const parsedExpr = binding.parsedExpr;
    if (parsedExpr?.expr) {
      const expression = convertFromExpr(parsedExpr.expr);
      // Skip EXPORTER role if it has a non-empty statement condition.
      if (binding.role === PresetRoleType.PROJECT_EXPORTER) {
        if (expression.statement && expression.statement !== "") {
          continue;
        }
      }

      const expiredDateTime = getExpiredDateTime(binding);
      if (
        expiredDateTime &&
        new Date().getTime() >= expiredDateTime.getTime()
      ) {
        return true;
      }
    }
  }

  return false;
});

const composedMemberList = computed(() => {
  const distinctUserResourceNameList = uniq(
    iamPolicy.value.bindings.flatMap((binding) => binding.members)
  );

  const userList = distinctUserResourceNameList.map((user) => {
    const email = extractUserEmail(user);
    return (
      userStore.getUserByEmail(email) ?? {
        ...unknownUser(),
        email,
      }
    );
  });

  const usersByRole = iamPolicy.value.bindings
    .filter((binding) => {
      // Don't show EXPORTER role if it has a non-empty statement condition.
      if (binding.role === PresetRoleType.PROJECT_EXPORTER) {
        const parsedExpr = binding.parsedExpr;
        if (parsedExpr?.expr) {
          const expression = convertFromExpr(parsedExpr.expr);
          if (expression.statement && expression.statement !== "") {
            return false;
          }
        }
      }
      return true;
    })
    .map((binding) => {
      return {
        binding: binding,
        role: binding.role,
        users: new Set(binding.members.map(extractUserEmail)),
      };
    });

  const userRolesList = userList.map<ComposedProjectMember>((user) => {
    const bindingList = uniq(
      usersByRole
        .filter((item) => item.users.has(user.email))
        .map((item) => item.binding)
    );
    return {
      user,
      bindingList,
    };
  });

  return orderBy(
    userRolesList,
    [
      (item) =>
        item.bindingList.find(
          (binding) => binding.role === PresetRoleType.PROJECT_OWNER
        )
          ? 0
          : 1,
      (item) => parseInt(extractUserUID(item.user.name), 10),
    ],
    ["asc", "asc"]
  );
});

const activeComposedMemberList = computed(() => {
  return composedMemberList.value.filter(
    (item) => item.user.state === State.ACTIVE
  );
});

const renderedComposedMemberList = computed(() => {
  const { searchText } = state;
  if (searchText === "") {
    return activeComposedMemberList.value;
  }
  return activeComposedMemberList.value.filter(
    (item) =>
      item.user.title.toLowerCase().includes(searchText.toLowerCase()) ||
      item.user.email.toLowerCase().includes(searchText.toLowerCase())
  );
});

const inactiveComposedMemberList = computed(() => {
  return composedMemberList.value.filter(
    (item) => item.user.state === State.DELETED
  );
});

const isMemeberSelected = (member: ComposedProjectMember) => {
  return state.selectedMemberNameList.has(member.user.name);
};

const getAllSelectionState = (
  memberList: ComposedProjectMember[]
): { checked: boolean; indeterminate: boolean } => {
  const checked =
    state.selectedMemberNameList.size > 0 &&
    memberList.every((member) => isMemeberSelected(member));
  const indeterminate =
    !checked && memberList.some((member) => isMemeberSelected(member));

  return {
    checked,
    indeterminate,
  };
};

const toggleMemberSelection = (member: ComposedProjectMember, on: boolean) => {
  if (on) {
    state.selectedMemberNameList.add(member.user.name);
  } else {
    state.selectedMemberNameList.delete(member.user.name);
  }
};

const toggleAllMembersSelection = (
  memberList: ComposedProjectMember[],
  on: boolean
): void => {
  const set = state.selectedMemberNameList;
  if (on) {
    memberList.forEach((member) => {
      set.add(member.user.name);
    });
  } else {
    memberList.forEach((member) => {
      set.delete(member.user.name);
    });
  }
};

const handleRevokeSelectedMembers = () => {
  const selectedMembers = Array.from(state.selectedMemberNameList.values())
    .map((name) => {
      return composedMemberList.value.find(
        (member) => member.user.name === name
      );
    })
    .filter((member) => member !== undefined) as ComposedProjectMember[];
  if (selectedMembers.length === 0) {
    return;
  }
  if (
    selectedMembers
      .map((member) => member.user.name)
      .includes(currentUserV1.value.name)
  ) {
    pushNotification({
      module: "bytebase",
      style: "WARN",
      title: "You cannot revoke yourself",
    });
    return;
  }

  dialog.create({
    title: t("project.members.revoke-members"),
    negativeText: t("common.cancel"),
    positiveText: t("common.confirm"),
    onPositiveClick: async () => {
      const userIAMNameList = selectedMembers.map((member) => {
        return getUserEmailInBinding(member!.user.email);
      });
      const policy = cloneDeep(iamPolicy.value);

      for (const binding of policy.bindings) {
        binding.members = binding.members.filter(
          (member) => !userIAMNameList.includes(member)
        );
      }
      policy.bindings = policy.bindings.filter(
        (binding) => binding.members.length > 0
      );
      await useProjectIamPolicyStore().updateProjectIamPolicy(
        projectResourceName.value,
        policy
      );

      pushNotification({
        module: "bytebase",
        style: "SUCCESS",
        title: "Revoke succeed",
      });
      state.selectedMemberNameList.clear();
    },
  });
};

const handleRemoveExpiredRoles = async () => {
  const policy = cloneDeep(iamPolicy.value);
  // Filter out expired roles.
  policy.bindings = policy.bindings.filter((binding) => {
    const expiredDateTime = getExpiredDateTime(binding);
    if (expiredDateTime && new Date().getTime() >= expiredDateTime.getTime()) {
      return false;
    }
    return true;
  });

  await useProjectIamPolicyStore().updateProjectIamPolicy(
    projectResourceName.value,
    policy
  );
};
</script>
