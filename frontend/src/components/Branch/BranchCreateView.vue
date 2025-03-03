<template>
  <div
    class="w-full h-full flex flex-col gap-y-3 relative overflow-y-hidden overflow-x-auto pt-0.5"
  >
    <div
      class="w-[32rem] grid gap-y-3 gap-x-4 whitespace-nowrap items-center"
      style="grid-template-columns: minmax(auto, 8rem) 1fr"
    >
      <div class="contents">
        <div class="text-sm">
          {{ $t("database.branch-name") }}
        </div>
        <BBTextField
          v-model:value="branchId"
          required
          class="!w-60 text-sm"
          :placeholder="'feature/add-billing'"
        />
      </div>
      <div class="contents">
        <div class="text-sm">
          {{ $t("branch.source.self") }}
        </div>
        <NRadioGroup
          :value="source"
          class="!flex flex-row gap-x-2"
          @update:value="handleSwitchSource"
        >
          <NRadio value="PARENT">
            {{ $t("branch.source.parent-branch") }}
          </NRadio>
          <NRadio value="BASELINE">
            {{ $t("branch.source.baseline-version") }}
          </NRadio>
        </NRadioGroup>
      </div>
      <div v-if="source === 'PARENT'" class="contents">
        <div class="text-sm">
          {{ $t("schema-designer.parent-branch") }}
        </div>
        <BranchSelector
          v-model:branch="parentBranchName"
          :project="project"
          :loading="isPreparingBranch"
          :filter="filterParentBranch"
          class=""
          clearable
        />
      </div>
      <BaselineSchemaSelector
        v-if="source === 'BASELINE'"
        v-model:database-id="databaseId"
        :project-id="projectId"
        :loading="isPreparingBranch"
      />
    </div>
    <NDivider class="!my-0" />
    <div class="w-full flex-1 overflow-y-hidden">
      <SchemaEditorLite
        :key="branchData?.branch.name ?? ''"
        :loading="isPreparingBranch"
        :project="project"
        :resource-type="'branch'"
        :branch="branchData?.branch ?? EMPTY_BRANCH"
        :readonly="true"
        :diff-when-ready="!!branchData?.parent"
      />
      <!-- turn on diff-when-ready is useful when the branch is created from a parent branch -->
    </div>
    <div class="w-full flex items-center justify-end">
      <NButton
        type="primary"
        :disabled="!allowConfirm"
        :loading="isCreating"
        @click.prevent="handleConfirm"
      >
        {{ confirmText }}
      </NButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useDebounce } from "@vueuse/core";
import { cloneDeep, uniqueId } from "lodash-es";
import { NButton, NDivider, NRadio, NRadioGroup } from "naive-ui";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import SchemaEditorLite from "@/components/SchemaEditorLite";
import { databaseServiceClient } from "@/grpcweb";
import { PROJECT_V1_ROUTE_BRANCH_DETAIL } from "@/router/dashboard/projectV1";
import {
  pushNotification,
  useDatabaseV1Store,
  useProjectV1Store,
} from "@/store";
import { useBranchStore } from "@/store/modules/branch";
import { UNKNOWN_ID } from "@/types";
import { Branch } from "@/types/proto/v1/branch_service";
import { DatabaseMetadataView } from "@/types/proto/v1/database_service";
import BaselineSchemaSelector from "./BaselineSchemaSelector.vue";
import BranchSelector from "./BranchSelector.vue";
import { validateBranchName } from "./utils";

type Source = "PARENT" | "BASELINE";

type BranchData = {
  branch: Branch;
  parent: string | undefined;
};

const props = defineProps({
  projectId: {
    type: String,
    default: undefined,
  },
});

const DEBOUNCE_RATE = 100;
const { t } = useI18n();
const router = useRouter();
const databaseStore = useDatabaseV1Store();
const projectStore = useProjectV1Store();
const branchStore = useBranchStore();
const source = ref<Source>("PARENT");
const projectId = ref(props.projectId);
const databaseId = ref<string>();
const parentBranchName = ref<string>();
const isCreating = ref(false);
const branchId = ref<string>("");
const isPreparingBranch = ref(false);

const EMPTY_BRANCH = Branch.fromPartial({});

const project = computed(() => {
  const project = projectStore.getProjectByUID(projectId.value || "");
  return project;
});

const debouncedDatabaseId = useDebounce(databaseId, DEBOUNCE_RATE);
const debouncedParentBranchName = useDebounce(parentBranchName, DEBOUNCE_RATE);

const filterParentBranch = (branch: Branch) => {
  // Only "main branch" aka parent-less branches can be parents.
  return !branch.parentBranch;
};

const nextFakeBranchName = () => {
  return `${project.value.name}/branches/-${uniqueId()}`;
};

const prepareBranchFromParentBranch = async (parent: string) => {
  const tag = `prepareBranchFromParentBranch(${parent})`;
  console.time(tag);
  const parentBranch = await branchStore.fetchBranchByName(
    parent,
    false /* !useCache */
  );
  const branch = cloneDeep(parentBranch);
  branch.name = nextFakeBranchName();
  console.timeEnd(tag);
  return branch;
};
const prepareBranchFromDatabaseHead = async (uid: string) => {
  const tag = `prepareBranchFromDatabaseHead(${uid})`;
  console.time(tag);

  console.time("--fetch metadata");
  const database = databaseStore.getDatabaseByUID(uid);
  const metadata = await databaseServiceClient.getDatabaseMetadata({
    name: `${database.name}/metadata`,
    view: DatabaseMetadataView.DATABASE_METADATA_VIEW_FULL,
  });
  console.timeEnd("--fetch metadata");

  console.time("--build branch object");
  // Here metadata is not used for editing, so we need not to clone a copy
  // for baseline
  const branch = Branch.fromPartial({
    name: nextFakeBranchName(),
    engine: database.instanceEntity.engine,
    baselineDatabase: database.name,
    baselineSchemaMetadata: metadata,
    schemaMetadata: metadata,
  });
  console.timeEnd("--build branch object");

  console.timeEnd(tag);
  return branch;
};

const branchData = shallowRef<BranchData>();

const prepareBranch = async (
  _parentBranchName: string | undefined,
  _databaseId: string | undefined
) => {
  isPreparingBranch.value = true;

  const finish = (s: BranchData | undefined) => {
    const isOutdated =
      _parentBranchName !== parentBranchName.value ||
      _databaseId !== databaseId.value;
    if (isOutdated) {
      return;
    }

    branchData.value = s;
    isPreparingBranch.value = false;
  };

  if (_parentBranchName) {
    const branch = await prepareBranchFromParentBranch(_parentBranchName);
    return finish({
      branch,
      parent: _parentBranchName,
    });
  }
  if (_databaseId && _databaseId !== String(UNKNOWN_ID)) {
    const branch = await prepareBranchFromDatabaseHead(_databaseId);
    return finish({
      branch,
      parent: undefined,
    });
  }
  return finish(undefined);
};

const handleSwitchSource = (src: Source) => {
  source.value = src;
  if (src === "PARENT") {
    databaseId.value = undefined;
  } else {
    parentBranchName.value = undefined;
  }
};

watch(
  [debouncedParentBranchName, debouncedDatabaseId],
  ([parentBranchName, databaseId]) => {
    prepareBranch(parentBranchName, databaseId);
  }
);

const allowConfirm = computed(() => {
  return branchId.value && branchData.value && !isCreating.value;
});

const confirmText = computed(() => {
  return t("common.create");
});

const handleConfirm = async () => {
  if (!branchData.value) {
    return;
  }

  if (!validateBranchName(branchId.value)) {
    pushNotification({
      module: "bytebase",
      style: "CRITICAL",
      title: "Branch name valid characters: /^[a-zA-Z][a-zA-Z0-9-_/]+$/",
    });
    return;
  }

  const { branch, parent } = branchData.value;

  const { baselineDatabase } = branch;
  isCreating.value = true;
  if (!parent) {
    await branchStore.createBranch(
      project.value.name,
      branchId.value,
      Branch.fromPartial({
        baselineDatabase,
      })
    );
  } else {
    await branchStore.createBranch(
      project.value.name,
      branchId.value,
      Branch.fromPartial({
        parentBranch: parent,
      })
    );
  }
  isCreating.value = false;
  pushNotification({
    module: "bytebase",
    style: "SUCCESS",
    title: t("schema-designer.message.created-succeed"),
  });

  // Go to branch detail page after created.
  router.replace({
    name: PROJECT_V1_ROUTE_BRANCH_DETAIL,
    params: {
      branchName: branchId.value,
    },
  });
};
</script>
