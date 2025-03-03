<template>
  <div class="space-y-4">
    <div
      class="w-full text-lg font-medium leading-7 text-main flex flex-col sm:flex-row items-start sm:items-end justify-between gap-2"
    >
      <AdvancedSearchBox
        v-model:params="state.params"
        class="flex-1"
        :autofocus="false"
        :placeholder="$t('database.filter-database')"
        :support-option-id-list="supportOptionIdList"
      />
      <DatabaseLabelFilter
        v-model:selected="state.selectedLabels"
        :database-list="databaseList"
        :placement="'left-start'"
      />
    </div>

    <div class="space-y-2">
      <DatabaseOperations
        v-if="showDatabaseOperations"
        :project-uid="project.uid"
        :databases="selectedDatabases"
      />

      <DatabaseV1Table
        mode="PROJECT"
        table-class="border"
        :show-selection-column="true"
        :show-placeholder="true"
        :database-list="filteredDatabaseList"
      >
        <template #selection-all="{ databaseList: selectedDatabaseList }">
          <NCheckbox
            v-if="selectedDatabaseList.length > 0"
            v-bind="getAllSelectionState(selectedDatabaseList as ComposedDatabase[])"
            @update:checked="
              toggleDatabasesSelection(
                selectedDatabaseList as ComposedDatabase[],
                $event
              )
            "
          />
        </template>
        <template #selection="{ database }">
          <NCheckbox
            :checked="isDatabaseSelected(database as ComposedDatabase)"
            @update:checked="
              toggleDatabasesSelection([database as ComposedDatabase], $event)
            "
          />
        </template>
        <template v-if="databaseList.length === 0" #placeholder>
          <div class="p-8 text-center textinfolabel">
            <i18n-t
              v-if="showEmptyActions"
              keypath="project.overview.no-db-prompt"
              tag="p"
            >
              <template #newDb>
                <span class="text-main font-bold">{{
                  $t("quick-action.new-db")
                }}</span>
              </template>
              <template #transferInDb>
                <span class="text-main font-bold">{{
                  $t("quick-action.transfer-in-db")
                }}</span>
              </template>
            </i18n-t>
            <i18n-t v-else keypath="common.no-data" tag="p"></i18n-t>
          </div>
        </template>
      </DatabaseV1Table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { NCheckbox } from "naive-ui";
import { reactive, computed } from "vue";
import { usePageMode } from "@/store";
import { ComposedDatabase, ComposedProject, UNKNOWN_ID } from "@/types";
import {
  filterDatabaseV1ByKeyword,
  SearchParams,
  CommonFilterScopeIdList,
  extractEnvironmentResourceName,
  extractInstanceResourceName,
} from "@/utils";
import { DatabaseV1Table, DatabaseOperations, DatabaseLabelFilter } from "./v2";

interface LocalState {
  selectedDatabaseIds: Set<string>;
  selectedLabels: { key: string; value: string }[];
  params: SearchParams;
}

const props = defineProps<{
  project: ComposedProject;
  databaseList: ComposedDatabase[];
}>();

const pageMode = usePageMode();

const state = reactive<LocalState>({
  selectedDatabaseIds: new Set(),
  selectedLabels: [],
  params: {
    query: "",
    scopes: [],
  },
});

const selectedInstance = computed(() => {
  return (
    state.params.scopes.find((scope) => scope.id === "instance")?.value ??
    `${UNKNOWN_ID}`
  );
});

const selectedEnvironment = computed(() => {
  return (
    state.params.scopes.find((scope) => scope.id === "environment")?.value ??
    `${UNKNOWN_ID}`
  );
});

const filteredDatabaseList = computed(() => {
  let list = props.databaseList;
  if (selectedEnvironment.value !== `${UNKNOWN_ID}`) {
    list = list.filter(
      (db) =>
        extractEnvironmentResourceName(db.effectiveEnvironment) ===
        selectedEnvironment.value
    );
  }
  if (selectedInstance.value !== `${UNKNOWN_ID}`) {
    list = list.filter(
      (db) =>
        extractInstanceResourceName(db.instanceEntity.name) ===
        selectedInstance.value
    );
  }
  const keyword = state.params.query.trim().toLowerCase();
  if (keyword) {
    list = list.filter((db) =>
      filterDatabaseV1ByKeyword(db, keyword, [
        "name",
        "environment",
        "instance",
      ])
    );
  }
  const labels = state.selectedLabels;
  if (labels.length > 0) {
    list = list.filter((db) => {
      return labels.some((kv) => db.labels[kv.key] === kv.value);
    });
  }
  return list;
});

const showDatabaseOperations = computed(() => {
  if (pageMode.value === "STANDALONE") {
    return true;
  }

  return true;
});

const showEmptyActions = computed(() => {
  return pageMode.value === "BUNDLED";
});

const getAllSelectionState = (
  databaseList: ComposedDatabase[]
): { checked: boolean; indeterminate: boolean } => {
  const checked =
    state.selectedDatabaseIds.size > 0 &&
    databaseList.every((db) => state.selectedDatabaseIds.has(db.uid));
  const indeterminate =
    !checked &&
    databaseList.some((db) => state.selectedDatabaseIds.has(db.uid));

  return {
    checked,
    indeterminate,
  };
};

const toggleDatabasesSelection = (
  databaseList: ComposedDatabase[],
  on: boolean
): void => {
  if (on) {
    databaseList.forEach((db) => {
      state.selectedDatabaseIds.add(db.uid);
    });
  } else {
    databaseList.forEach((db) => {
      state.selectedDatabaseIds.delete(db.uid);
    });
  }
};

const isDatabaseSelected = (database: ComposedDatabase): boolean => {
  return state.selectedDatabaseIds.has((database as ComposedDatabase).uid);
};

const selectedDatabases = computed((): ComposedDatabase[] => {
  return filteredDatabaseList.value.filter((db) =>
    state.selectedDatabaseIds.has(db.uid)
  );
});

const supportOptionIdList = computed(() => [...CommonFilterScopeIdList]);
</script>
