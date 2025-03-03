<template>
  <div ref="wrapper" rule="database-table" v-bind="$attrs">
    <BBGrid
      :column-list="columnList"
      :data-source="pagedDataSource"
      :custom-header="true"
      :class="tableClass"
      :row-clickable="rowClickable"
      :show-placeholder="showPlaceholder"
      @click-row="clickDatabase"
    >
      <template #header>
        <div role="table-row" class="bb-grid-row bb-grid-header-row group">
          <div
            v-for="(column, index) in columnList"
            :key="index"
            role="table-cell"
            class="bb-grid-header-cell capitalize"
            :class="[column.class]"
          >
            <template v-if="showSelectionColumn && index === 0">
              <slot name="selection-all" :database-list="mixedDataList" />
            </template>
            <template v-else>{{ column.title }}</template>
          </div>
        </div>
      </template>

      <template
        #item="{
          item: database,
        }: {
          item: ComposedDatabase | ComposedDatabaseGroup,
        }"
      >
        <template v-if="isDatabase(database)">
          <DatabaseTableRow
            :database="database as ComposedDatabase"
            :mode="mode"
            :show-selection-column="showSelectionColumn"
            :show-misc-column="showMiscColumn"
            :show-schema-version-column="showSchemaVersionColumn"
            :show-project-column="showProjectColumn"
            :show-environment-column="showEnvironmentColumn"
            :show-tenant-icon="showTenantIcon"
            :show-instance-column="showInstanceColumn"
            :show-labels-column="showLabelsColumn"
            :show-sql-editor-button="showSQLEditorButton"
            :allow-query="allowQuery(database as ComposedDatabase)"
            @goto-sql-editor-failed="
              handleGotoSQLEditorFailed(database as ComposedDatabase)
            "
          >
            <template v-if="showSelectionColumn" #selection>
              <slot name="selection" :database="database" />
            </template>
          </DatabaseTableRow>
        </template>
        <template v-else>
          <DatabaseGroupTableRow
            :database-group="(database as ComposedDatabaseGroup)"
            :mode="mode"
            :show-selection-column="showSelectionColumn"
            :show-misc-column="showMiscColumn"
            :show-schema-version-column="showSchemaVersionColumn"
            :show-project-column="showProjectColumn"
            :show-environment-column="showEnvironmentColumn"
            :show-tenant-icon="showTenantIcon"
            :show-instance-column="showInstanceColumn"
            :show-labels-column="showLabelsColumn"
          >
            <template v-if="showSelectionColumn" #selection>
              <slot name="selection" :database="database" />
            </template>
          </DatabaseGroupTableRow>
        </template>
      </template>

      <template #placeholder-content>
        <slot name="placeholder"></slot>
      </template>

      <template #footer>
        <div
          v-if="hasReservedDatabases && !state.showReservedDatabaseList"
          class="flex items-center justify-center cursor-pointer hover:bg-gray-200 py-2 text-gray-400 text-sm"
          @click="showReservedDatabaseList()"
        >
          {{ $t("database.show-reserved-databases") }}
        </div>
      </template>
    </BBGrid>
  </div>

  <div
    v-if="showPagination"
    class="flex justify-end !mt-2"
    :class="paginationClass"
  >
    <NPagination
      :item-count="table.getCoreRowModel().rows.length"
      :page="table.getState().pagination.pageIndex + 1"
      :page-size="table.getState().pagination.pageSize"
      :show-quick-jumper="true"
      @update-page="handleChangePage"
      @update-page-size="table.setPageSize($event)"
    />
  </div>

  <BBModal
    v-if="state.showIncorrectProjectModal"
    :title="$t('common.warning')"
    @close="handleIncorrectProjectModalCancel"
  >
    <div class="col-span-1 w-96">
      {{ $t("database.incorrect-project-warning") }}
    </div>
    <div class="pt-6 flex justify-end space-x-3">
      <NButton @click.prevent="handleIncorrectProjectModalCancel">
        {{ $t("common.cancel") }}
      </NButton>
      <NButton
        type="primary"
        @click.prevent="handleIncorrectProjectModalConfirm"
      >
        {{ $t("database.go-to-transfer") }}
      </NButton>
    </div>
  </BBModal>
</template>

<script lang="ts" setup>
import type { ColumnDef } from "@tanstack/vue-table";
import { sortBy } from "lodash-es";
import cloneDeep from "lodash-es/cloneDeep";
import { NPagination } from "naive-ui";
import {
  computed,
  nextTick,
  PropType,
  reactive,
  ref,
  watch,
  watchEffect,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { BBGridColumn } from "@/bbkit/types";
import { usePolicyV1Store, usePageMode, useCurrentUserV1 } from "@/store";
import { getProjectNameAndDatabaseGroupName } from "@/store/modules/v1/common";
import { ComposedDatabase, ComposedDatabaseGroup } from "@/types";
import {
  Policy,
  PolicyType,
  PolicyResourceType,
} from "@/types/proto/v1/org_policy_service";
import { getScrollParent } from "@/utils";
import {
  databaseV1Slug,
  isDatabaseV1Queryable,
  isPITRDatabaseV1,
  VueClass,
} from "@/utils";
import DatabaseGroupTableRow from "./DatabaseGroupTableRow.vue";
import DatabaseTableRow from "./DatabaseTableRow.vue";
import { isDatabase, Mode } from "./utils";

const { getCoreRowModel, getPaginationRowModel, useVueTable } = await import(
  "@tanstack/vue-table"
);

interface LocalState {
  showIncorrectProjectModal: boolean;
  warningDatabase?: ComposedDatabase;
  showReservedDatabaseList: boolean;
}

const props = defineProps({
  bordered: {
    default: true,
    type: Boolean,
  },
  tableClass: {
    type: [String, Array, Object] as PropType<VueClass>,
    default: undefined,
  },
  paginationClass: {
    type: [String, Array, Object] as PropType<VueClass>,
    default: undefined,
  },
  mode: {
    default: "ALL",
    type: String as PropType<Mode>,
  },
  singleInstance: {
    default: true,
    type: Boolean,
  },

  showSelectionColumn: {
    type: Boolean,
    default: false,
  },
  rowClickable: {
    default: true,
    type: Boolean,
  },
  customClick: {
    default: false,
    type: Boolean,
  },
  databaseList: {
    required: true,
    type: Object as PropType<ComposedDatabase[]>,
  },
  databaseGroupList: {
    required: false,
    type: Object as PropType<ComposedDatabaseGroup[]>,
    default: undefined,
  },
  pageSize: {
    type: Number,
    default: 20,
  },
  scrollOnPageChange: {
    type: Boolean,
    default: true,
  },
  schemaless: {
    type: Boolean,
    default: false,
  },
  showPlaceholder: {
    type: Boolean,
    default: undefined,
  },
  showSqlEditorButton: {
    required: false,
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["select-database"]);

const router = useRouter();
const policyStore = usePolicyV1Store();
const currentUserV1 = useCurrentUserV1();
const { t } = useI18n();
const state = reactive<LocalState>({
  showIncorrectProjectModal: false,
  showReservedDatabaseList: false,
});
const pageMode = usePageMode();
const wrapper = ref<HTMLElement>();

const regularDatabaseList = computed(() =>
  props.databaseList.filter((db) => !isPITRDatabaseV1(db))
);
const reservedDatabaseList = computed(() =>
  props.databaseList.filter((db) => isPITRDatabaseV1(db))
);
const hasReservedDatabases = computed(
  () => reservedDatabaseList.value.length > 0
);

const mixedDataList = computed(() => {
  const dataList: (ComposedDatabase | ComposedDatabaseGroup)[] = [
    ...regularDatabaseList.value,
  ];
  if (state.showReservedDatabaseList) {
    dataList.push(...reservedDatabaseList.value);
  }
  if (props.databaseGroupList) {
    dataList.push(...props.databaseGroupList);
  }
  return sortBy(dataList, (d) => {
    if (isDatabase(d)) {
      return (d as ComposedDatabase).effectiveEnvironment;
    } else {
      return (d as ComposedDatabaseGroup).environment.name;
    }
  });
});

const policyList = ref<Policy[]>([]);

const preparePolicyList = () => {
  if (showSQLEditorLink.value) {
    policyStore
      .fetchPolicies({
        policyType: PolicyType.WORKSPACE_IAM,
        resourceType: PolicyResourceType.WORKSPACE,
      })
      .then((list) => (policyList.value = list));
  }
};

const columnListMap = computed(() => {
  const NAME = {
    title: t("common.name"),
    width: "minmax(min-content, auto)",
  };
  const SCHEMA_VERSION = props.schemaless
    ? undefined
    : {
        title: t("common.schema-version"),
        width: { lg: "minmax(min-content, auto)" },
        class: "hidden lg:flex",
      };
  const PROJECT = {
    title: t("common.project"),
    width: "minmax(min-content, auto)",
  };
  const ENVIRONMENT = {
    title: t("common.environment"),
    width: "minmax(min-content, auto)",
  };
  const INSTANCE = {
    title: t("common.instance"),
    width: "minmax(min-content, auto)",
  };
  const LABELS = {
    title: t("common.labels"),
    width: "minmax(max-content, auto)",
    class: "items-center",
  };
  return new Map<Mode, (BBGridColumn | undefined)[]>([
    ["ALL", [NAME, ENVIRONMENT, SCHEMA_VERSION, PROJECT, INSTANCE, LABELS]],
    ["ALL_SHORT", [NAME, ENVIRONMENT, SCHEMA_VERSION, PROJECT, INSTANCE]],
    ["ALL_TINY", [NAME, ENVIRONMENT, PROJECT, INSTANCE]],
    ["INSTANCE", [NAME, ENVIRONMENT, SCHEMA_VERSION, PROJECT, LABELS]],
    ["PROJECT", [NAME, ENVIRONMENT, SCHEMA_VERSION, INSTANCE, LABELS]],
    ["PROJECT_SHORT", [NAME, ENVIRONMENT, SCHEMA_VERSION, INSTANCE]],
  ]);
});

const showSchemaVersionColumn = computed(() => {
  return props.mode !== "ALL_TINY" && !props.schemaless;
});

const showInstanceColumn = computed(() => {
  return props.mode != "INSTANCE";
});

const showProjectColumn = computed(() => {
  return props.mode != "PROJECT" && props.mode != "PROJECT_SHORT";
});

const showLabelsColumn = computed(() => {
  return (
    props.mode == "PROJECT" || props.mode == "ALL" || props.mode == "INSTANCE"
  );
});

const showEnvironmentColumn = computed(() => {
  return true;
});

const showMiscColumn = computed(() => {
  if (
    props.mode === "ALL_SHORT" ||
    props.mode === "ALL_TINY" ||
    props.mode === "PROJECT_SHORT"
  ) {
    return false;
  }
  return true;
});

const showSQLEditorButton = computed(() => {
  return pageMode.value === "BUNDLED" && props.showSqlEditorButton;
});

const columnList = computed(() => {
  const list = cloneDeep(columnListMap.value.get(props.mode)!).filter(Boolean);
  if (props.showSelectionColumn) {
    list.unshift({
      title: "",
      width: "minmax(auto, 2rem)",
      class: "items-center !px-2",
    });
  }
  return list as BBGridColumn[];
});

const table = useVueTable<ComposedDatabase | ComposedDatabaseGroup>({
  get data() {
    return mixedDataList.value;
  },
  get columns() {
    return columnList.value.map<
      ColumnDef<ComposedDatabase | ComposedDatabaseGroup>
    >((col, index) => ({
      header: col.title!,
    }));
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
});

const pagedDataSource = computed(() => {
  return table.getRowModel().rows.map((row) => row.original);
});

const showPagination = computed(() => {
  return mixedDataList.value.length > props.pageSize;
});

const handleChangePage = (page: number) => {
  table.setPageIndex(page - 1);
  if (props.scrollOnPageChange && wrapper.value) {
    const parent = getScrollParent(wrapper.value);
    parent.scrollTo(0, 0);
  }
};
watch(
  () => props.pageSize,
  (ps) => {
    table.setPageSize(ps);
  },
  { immediate: true }
);

const showReservedDatabaseList = () => {
  const count = regularDatabaseList.value.length;
  const pageCount = table.getPageCount();
  const targetPage =
    count === pageCount * props.pageSize ? pageCount + 1 : pageCount;
  state.showReservedDatabaseList = true;
  nextTick(() => {
    handleChangePage(targetPage);
  });
};

const showSQLEditorLink = computed(() => {
  if (
    props.mode === "ALL_SHORT" ||
    props.mode === "ALL_TINY" ||
    props.mode === "PROJECT_SHORT"
  ) {
    return false;
  }
  return true;
});

const allowQuery = (database: ComposedDatabase) => {
  return isDatabaseV1Queryable(database, currentUserV1.value);
};

const showTenantIcon = computed(() => {
  return ["ALL", "ALL_SHORT", "INSTANCE"].includes(props.mode);
});

const handleGotoSQLEditorFailed = (database: ComposedDatabase) => {
  state.warningDatabase = database;
  state.showIncorrectProjectModal = true;
};

const handleIncorrectProjectModalConfirm = () => {
  if (state.warningDatabase) {
    router.push(`/db/${databaseV1Slug(state.warningDatabase)}`);
  }
};

const handleIncorrectProjectModalCancel = () => {
  state.showIncorrectProjectModal = false;
  state.warningDatabase = undefined;
};

const clickDatabase = (
  database: ComposedDatabase | ComposedDatabaseGroup,
  section: number,
  row: number,
  e: MouseEvent
) => {
  if (!props.rowClickable) return;

  if (props.customClick) {
    emit("select-database", database);
  } else {
    if (isDatabase(database)) {
      const url = `/db/${databaseV1Slug(database as ComposedDatabase)}`;
      if (e.ctrlKey || e.metaKey) {
        window.open(url, "_blank");
      } else {
        router.push(url);
      }
    } else {
      const [_, databaseGroupName] = getProjectNameAndDatabaseGroupName(
        database.name
      );
      router.push(
        `/${
          (database as ComposedDatabaseGroup).project.name
        }/database-groups/${databaseGroupName}`
      );
    }
  }
};

watchEffect(preparePolicyList);
</script>
