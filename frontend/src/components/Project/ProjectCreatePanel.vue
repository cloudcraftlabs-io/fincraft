<template>
  <DrawerContent :title="$t('quick-action.create-project')">
    <form class="w-96 space-y-6 divide-y divide-block-border">
      <div class="grid gap-y-6 gap-x-4 grid-cols-1">
        <div class="col-span-1">
          <label
            for="name"
            class="text-base leading-6 font-medium text-control"
          >
            {{ $t("project.create-modal.project-name") }}
            <span class="text-red-600">*</span>
          </label>
          <BBTextField
            v-model:value="state.project.title"
            class="mt-4 w-full"
            :required="true"
            :placeholder="$t('project.create-modal.project-name')"
          />
        </div>
        <div class="-mt-2">
          <ResourceIdField
            ref="resourceIdField"
            resource-type="project"
            :value="state.resourceId"
            :resource-title="state.project.title"
            :validate="validateResourceId"
            @update:value="state.resourceId = $event"
          />
        </div>
        <div class="col-span-1">
          <label
            for="name"
            class="flex text-base leading-6 font-medium text-control"
          >
            {{ $t("project.create-modal.key") }}
            <NTooltip>
              <template #trigger>
                <heroicons-outline:information-circle class="ml-1 w-4 h-auto" />
              </template>
              {{ $t("project.key-hint") }}
            </NTooltip>
            <span class="text-red-600">*</span>
          </label>
          <BBTextField
            v-model:value="state.project.key"
            class="mt-4 w-full uppercase"
            :required="true"
          />
        </div>
        <div class="col-span-1">
          <div for="name" class="text-base leading-6 font-medium text-control">
            {{ $t("common.mode") }}
            <span class="text-red-600">*</span>
          </div>
          <div class="mt-2 textlabel">
            <ProjectModeRadioGroup v-model:value="state.project.tenantMode" />
          </div>
        </div>
      </div>
    </form>

    <div
      v-if="state.isCreating"
      class="absolute inset-0 bg-white/50 flex justify-center items-center"
    >
      <BBSpin />
    </div>

    <template #footer>
      <div class="flex justify-end items-center gap-x-3">
        <NButton @click.prevent="cancel">
          {{ $t("common.cancel") }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!allowCreate"
          @click.prevent="create"
        >
          {{ $t("common.create") }}
        </NButton>
      </div>
    </template>
  </DrawerContent>

  <FeatureModal
    feature="bb.feature.multi-tenancy"
    :open="state.showFeatureModal"
    @cancel="state.showFeatureModal = false"
  />
</template>

<script lang="ts" setup>
import { isEmpty } from "lodash-es";
import { NButton } from "naive-ui";
import { Status } from "nice-grpc-common";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { DrawerContent } from "@/components/v2";
import ResourceIdField from "@/components/v2/Form/ResourceIdField.vue";
import { hasFeature, pushNotification, useUIStateStore } from "@/store";
import { projectNamePrefix } from "@/store/modules/v1/common";
import { useProjectV1Store } from "@/store/modules/v1/project";
import { ResourceId, ValidatedMessage, emptyProject } from "@/types";
import { Project, TenantMode } from "@/types/proto/v1/project_service";
import { randomString } from "@/utils";
import { getErrorCode } from "@/utils/grpcweb";

interface LocalState {
  project: Project;
  resourceId: string;
  showFeatureModal: boolean;
  isCreating: boolean;
}

const emit = defineEmits<{
  (event: "dismiss"): void;
}>();

const router = useRouter();
const { t } = useI18n();
const projectV1Store = useProjectV1Store();

const state = reactive<LocalState>({
  project: {
    ...emptyProject(),
    title: "New Project",
    key: randomString(3).toUpperCase(),
  },
  resourceId: "",
  showFeatureModal: false,
  isCreating: false,
});
const resourceIdField = ref<InstanceType<typeof ResourceIdField>>();

const validateResourceId = async (
  resourceId: ResourceId
): Promise<ValidatedMessage[]> => {
  if (!resourceId) {
    return [];
  }

  try {
    const project = await projectV1Store.getOrFetchProjectByName(
      projectNamePrefix + resourceId,
      true /* silent */
    );
    if (project) {
      return [
        {
          type: "error",
          message: t("resource-id.validation.duplicated", {
            resource: t("resource.project"),
          }),
        },
      ];
    }
  } catch (error) {
    if (getErrorCode(error) !== Status.NOT_FOUND) {
      throw error;
    }
  }

  return [];
};

const allowCreate = computed(() => {
  if (isEmpty(state.project.title)) return false;
  if (!resourceIdField.value?.isValidated) return false;
  return true;
});

const create = async () => {
  if (
    state.project.tenantMode === TenantMode.TENANT_MODE_ENABLED &&
    !hasFeature("bb.feature.multi-tenancy")
  ) {
    state.showFeatureModal = true;
    return;
  }
  if (!allowCreate.value) {
    return;
  }

  try {
    state.isCreating = true;
    const createdProject = await projectV1Store.createProject(
      state.project,
      state.resourceId
    );
    useUIStateStore().saveIntroStateByKey({
      key: "project.visit",
      newState: true,
    });
    pushNotification({
      module: "bytebase",
      style: "SUCCESS",
      title: t("project.create-modal.success-prompt", {
        name: createdProject.title,
      }),
    });
    const url = {
      path: `/${createdProject.name}`,
    };
    router.push(url);
    emit("dismiss");
  } finally {
    state.isCreating = false;
  }
};

const cancel = () => {
  emit("dismiss");
};
</script>
