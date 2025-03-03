<template>
  <Drawer
    :show="true"
    width="auto"
    @update:show="(show: boolean) => !show && $emit('close')"
  >
    <DrawerContent
      :title="$t('project.members.grant-access')"
      :closable="true"
      class="w-[50rem] max-w-[100vw] relative"
    >
      <div
        v-for="(binding, index) in state.bindings"
        :key="index"
        class="w-full"
      >
        <AddProjectMemberForm
          v-if="binding"
          ref="formRefs"
          class="w-full border-b mb-4 pb-4"
          :project="project"
          :binding="binding"
          :allow-remove="filteredBindings.length > 1"
          @remove="handleRemove(binding, index)"
        />
      </div>
      <div>
        <NButton @click="handleAddMore">
          <heroicons-solid:plus class="w-5 h-auto text-gray-400" />
          {{ $t("project.members.add-more") }}
        </NButton>
      </div>
      <template #footer>
        <div class="flex items-center justify-end gap-x-2">
          <NButton @click="$emit('close')">{{ $t("common.cancel") }}</NButton>
          <NButton type="primary" :disabled="!allowConfirm" @click="addMembers">
            {{ $t("common.confirm") }}
          </NButton>
        </div>
      </template>
    </DrawerContent>
  </Drawer>
</template>

<script lang="ts" setup>
import { cloneDeep } from "lodash-es";
import { NButton } from "naive-ui";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Drawer, DrawerContent } from "@/components/v2";
import {
  pushNotification,
  useProjectIamPolicy,
  useProjectIamPolicyStore,
} from "@/store";
import { ComposedProject, PresetRoleType } from "@/types";
import { Binding } from "@/types/proto/v1/iam_policy";
import AddProjectMemberForm from "./AddProjectMemberForm.vue";

const props = defineProps<{
  project: ComposedProject;
  bindings?: Binding[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

interface LocalState {
  bindings: (Binding | undefined)[];
}

const { t } = useI18n();
const state = reactive<LocalState>({
  bindings: props.bindings || [Binding.fromPartial({})],
});
const formRefs = ref<InstanceType<typeof AddProjectMemberForm>[]>([]);
const projectResourceName = computed(() => props.project.name);
const { policy: iamPolicy } = useProjectIamPolicy(projectResourceName);

const filteredBindings = computed(() => {
  return state.bindings.filter((binding) => binding !== undefined) as Binding[];
});

const allowConfirm = computed(() => {
  // Check if all forms are completed.
  for (const form of formRefs.value) {
    if (!form) {
      continue;
    }
    if (!form.allowConfirm) {
      return false;
    }
  }

  for (const binding of filteredBindings.value) {
    if (binding.members.length === 0 || binding.role === "") {
      return false;
    }
    // Filter uncompleted querier and exporter options.
    // TODO: use parsed expression to check if the expression is valid.
    if (binding.role === PresetRoleType.PROJECT_EXPORTER) {
      if (binding.condition?.expression === "") {
        return false;
      }
      if (!binding.condition?.expression.includes("request.row_limit")) {
        return false;
      }
    }
  }
  return true;
});

const handleAddMore = () => {
  state.bindings.push(Binding.fromPartial({}));
};

const handleRemove = (binding: Binding, index: number) => {
  state.bindings[index] = undefined;
};

const addMembers = async () => {
  if (!allowConfirm.value) {
    return;
  }

  const policy = cloneDeep(iamPolicy.value);
  policy.bindings.push(...filteredBindings.value);
  await useProjectIamPolicyStore().updateProjectIamPolicy(
    projectResourceName.value,
    policy
  );

  pushNotification({
    module: "bytebase",
    style: "SUCCESS",
    title: t("project.settings.success-member-added-prompt"),
  });
  emit("close");
};
</script>
