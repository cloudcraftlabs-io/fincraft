<template>
  <div class="flex flex-row items-center">
    <ClassificationLevelBadge
      :classification="classification"
      :classification-config="classificationConfig"
    />
    <template v-if="!readonly && !disabled">
      <MiniActionButton v-if="classification" @click.prevent="$emit('remove')">
        <XIcon class="w-3 h-3" />
      </MiniActionButton>
      <MiniActionButton @click.prevent="$emit('edit')">
        <PencilIcon class="w-3 h-3" />
      </MiniActionButton>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { PencilIcon, XIcon } from "lucide-vue-next";
import ClassificationLevelBadge from "@/components/SchemaTemplate/ClassificationLevelBadge.vue";
import { MiniActionButton } from "@/components/v2";
import { DataClassificationSetting_DataClassificationConfig as DataClassificationConfig } from "@/types/proto/v1/setting_service";

defineProps<{
  classification?: string | undefined;
  readonly?: boolean;
  disabled?: boolean;
  classificationConfig: DataClassificationConfig;
}>();
defineEmits<{
  (event: "edit"): void;
  (event: "remove"): void;
}>();
</script>
