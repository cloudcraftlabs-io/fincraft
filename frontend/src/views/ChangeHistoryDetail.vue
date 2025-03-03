<template>
  <div class="focus:outline-none" tabindex="0" v-bind="$attrs">
    <main v-if="changeHistory" class="flex flex-col relative pb-8 gap-y-6">
      <!-- Highlight Panel -->
      <div
        class="px-4 pb-4 border-b border-block-border md:flex md:items-center md:justify-between"
      >
        <div class="flex-1 min-w-0 space-y-3">
          <!-- Summary -->
          <div class="pt-2 flex items-center space-x-2">
            <ChangeHistoryStatusIcon :status="changeHistory.status" />
            <h1 class="text-xl font-bold leading-6 text-main truncate">
              {{ $t("common.version") }} {{ changeHistory.version }}
            </h1>
          </div>
          <p class="text-control">
            {{ changeHistory_SourceToJSON(changeHistory.source) }}
            {{ changeHistory_TypeToJSON(changeHistory.type) }} -
            {{ changeHistory.description }}
          </p>
          <dl
            class="flex flex-col space-y-1 md:space-y-0 md:flex-row md:flex-wrap"
          >
            <dt class="sr-only">{{ $t("common.issue") }}</dt>
            <dd class="flex items-center text-sm md:mr-4">
              <span class="textlabel"
                >{{ $t("common.issue") }}&nbsp;-&nbsp;</span
              >
              <router-link
                :to="`/issue/${extractIssueUID(changeHistory.issue)}`"
                class="normal-link"
              >
                {{ extractIssueUID(changeHistory.issue) }}
              </router-link>
            </dd>
            <dt class="sr-only">{{ $t("common.duration") }}</dt>
            <dd class="flex items-center text-sm md:mr-4">
              <span class="textlabel"
                >{{ $t("common.duration") }}&nbsp;-&nbsp;</span
              >
              {{ humanizeDurationV1(changeHistory.executionDuration) }}
            </dd>
            <dt class="sr-only">{{ $t("common.creator") }}</dt>
            <dd v-if="creator" class="flex items-center text-sm md:mr-4">
              <span class="textlabel"
                >{{ $t("common.creator") }}&nbsp;-&nbsp;</span
              >
              {{ creator.title }}
            </dd>
            <dt class="sr-only">{{ $t("common.created-at") }}</dt>
            <dd class="flex items-center text-sm md:mr-4">
              <span class="textlabel"
                >{{ $t("common.created-at") }}&nbsp;-&nbsp;</span
              >
              {{ humanizeDate(changeHistory.createTime) }} by
              {{ `version ${changeHistory.releaseVersion}` }}
            </dd>
          </dl>
          <div
            v-if="pushEvent"
            class="mt-1 text-sm text-control-light flex flex-row items-center space-x-1"
          >
            <template
              v-if="vcsTypeToJSON(pushEvent?.vcsType).startsWith('GITLAB')"
            >
              <img class="h-4 w-auto" src="@/assets/gitlab-logo.svg" />
            </template>
            <template
              v-if="vcsTypeToJSON(pushEvent?.vcsType).startsWith('GITHUB')"
            >
              <img class="h-4 w-auto" src="@/assets/github-logo.svg" />
            </template>
            <template
              v-if="vcsTypeToJSON(pushEvent?.vcsType).startsWith('BITBUCKET')"
            >
              <img class="h-4 w-auto" src="@/assets/bitbucket-logo.svg" />
            </template>
            <a :href="vcsBranchUrl" target="_blank" class="normal-link">
              {{ `${vcsBranch}@${pushEvent.repositoryFullPath}` }}
            </a>
            <span v-if="vcsCommit">
              {{ $t("common.commit") }}
              <a :href="vcsCommit.url" target="_blank" class="normal-link">
                {{ vcsCommit.id.substring(0, 7) }}:
              </a>
              <span class="text-main mr-1">{{ vcsCommit.title }}</span>
              <i18n-t keypath="change-history.commit-info">
                <template #author>
                  {{ pushEvent.authorName }}
                </template>
                <template #time>
                  {{ humanizeDate(vcsCommit.createdTime) }}
                </template>
              </i18n-t>
            </span>
          </div>
        </div>
      </div>

      <div v-if="affectedTables.length > 0" class="px-4">
        <span class="flex items-center text-lg text-main capitalize">
          {{ $t("change-history.affected-tables") }}
        </span>
        <div
          class="w-full flex flex-row justify-start items-center gap-x-3 gap-y-2"
        >
          <div
            v-for="affectedTable in affectedTables"
            :key="`${affectedTable.schema}.${affectedTable.table}`"
          >
            <span
              :class="
                !affectedTable.dropped
                  ? 'text-blue-600 cursor-pointer hover:opacity-80'
                  : 'text-gray-400 italic'
              "
              @click="handleAffectedTableClick(affectedTable)"
              >{{ getAffectedTableDisplayName(affectedTable) }}</span
            >
          </div>
        </div>
      </div>

      <div class="px-4 flex flex-col gap-y-6">
        <div class="flex flex-col gap-y-2">
          <a
            id="statement"
            href="#statement"
            class="w-auto flex items-center text-lg text-main mb-2 hover:underline"
          >
            {{ $t("common.statement") }}
            <button
              tabindex="-1"
              class="btn-icon ml-1"
              @click.prevent="copyStatement"
            >
              <heroicons-outline:clipboard class="w-6 h-6" />
            </button>
          </a>
          <highlight-code-block
            class="border p-2 whitespace-pre-wrap w-full"
            :code="changeHistoryStatement"
          />
          <div
            v-if="
              getStatementSize(changeHistory.statement).ne(
                changeHistory.statementSize
              )
            "
          >
            <NButton
              quaternary
              size="small"
              :disabled="state.loading"
              @click="fetchFullHistory"
            >
              <template #icon>
                <BBSpin v-if="state.loading" />
                <ChevronDownIcon v-else class="w-5" />
              </template>
              {{ $t("change-history.view-full") }}
            </NButton>
          </div>
        </div>
        <div v-if="showSchemaSnapshot" class="flex flex-col gap-y-2">
          <a
            id="schema"
            href="#schema"
            class="flex items-center text-lg text-main hover:underline capitalize"
          >
            Schema {{ $t("common.snapshot") }}
            <button
              tabindex="-1"
              class="btn-icon ml-1"
              @click.prevent="copySchema"
            >
              <heroicons-outline:clipboard class="w-6 h-6" />
            </button>
          </a>

          <div v-if="hasDrift" class="flex items-center gap-x-2">
            <div class="flex items-center text-sm font-normal">
              <heroicons-outline:exclamation-circle
                class="w-5 h-5 mr-0.5 text-error"
              />
              <span>{{ $t("change-history.schema-drift-detected") }}</span>
            </div>
            <div
              class="normal-link text-sm"
              data-label="bb-change-history-view-drift-button"
              @click="state.viewDrift = true"
            >
              {{ $t("change-history.view-drift") }}
            </div>
          </div>

          <div class="flex flex-row items-center gap-x-2">
            <div v-if="allowShowDiff" class="flex space-x-1 items-center">
              <NSwitch
                :value="state.showDiff"
                size="small"
                :disabled="state.loading"
                data-label="bb-change-history-diff-switch"
                @update:value="switchShowDiff"
              />
              <span class="text-sm font-semibold">
                {{ $t("change-history.show-diff") }}
              </span>
            </div>
            <div class="textinfolabel">
              <i18n-t
                v-if="state.showDiff"
                tag="span"
                keypath="change-history.left-vs-right"
              >
                <template #prevLink>
                  <router-link
                    v-if="previousHistory"
                    class="normal-link"
                    :to="previousHistoryLink"
                  >
                    ({{ previousHistory.version }})
                  </router-link>
                </template>
              </i18n-t>
              <template v-else>
                {{ $t("change-history.schema-snapshot-after-change") }}
              </template>
            </div>
            <div v-if="!allowShowDiff" class="text-sm font-normal text-accent">
              ({{ $t("change-history.no-schema-change") }})
            </div>
          </div>

          <DiffEditor
            v-if="state.showDiff"
            class="h-[64rem] max-h-full border rounded-md overflow-clip"
            :original="changeHistory.prevSchema"
            :modified="changeHistory.schema"
            :readonly="true"
          />
          <template v-else>
            <div v-if="changeHistory.schema" class="space-y-2">
              <highlight-code-block
                class="border p-2 whitespace-pre-wrap w-full"
                :code="changeHistorySchema"
                data-label="bb-change-history-code-block"
              />
              <div
                v-if="
                  getStatementSize(changeHistory.schema).ne(
                    changeHistory.schemaSize
                  )
                "
              >
                <NButton
                  quaternary
                  size="small"
                  :disabled="state.loading"
                  @click="fetchFullHistory"
                >
                  <template #icon>
                    <BBSpin v-if="state.loading" />
                    <ChevronDownIcon v-else class="w-5" />
                  </template>
                  {{ $t("change-history.view-full") }}
                </NButton>
              </div>
            </div>
            <div v-else>
              {{ $t("change-history.current-schema-empty") }}
            </div>
          </template>
        </div>
      </div>
    </main>

    <BBModal
      v-if="changeHistory && previousHistory && state.viewDrift"
      @close="state.viewDrift = false"
    >
      <template #title>
        <span>{{ $t("change-history.schema-drift") }}</span>
        <span class="mx-2">-</span>
        <i18n-t tag="span" keypath="change-history.left-vs-right">
          <template #prevLink>
            <router-link class="normal-link" :to="previousHistoryLink">
              ({{ previousHistory.version }})
            </router-link>
          </template>
        </i18n-t>
      </template>

      <div
        class="space-y-4 flex flex-col overflow-hidden"
        style="width: calc(100vw - 10rem); height: calc(100vh - 12rem)"
      >
        <DiffEditor
          class="flex-1 w-full border rounded-md overflow-clip"
          :original="previousHistory.schema"
          :modified="changeHistory.schema"
          :readonly="true"
        />
        <div class="flex justify-end">
          <NButton type="primary" @click.prevent="state.viewDrift = false">
            {{ $t("common.close") }}
          </NButton>
        </div>
      </div>
    </BBModal>
  </div>

  <TableDetailDrawer
    :show="!!selectedAffectedTable"
    :database-name="database.name"
    :schema-name="selectedAffectedTable?.schema ?? ''"
    :table-name="selectedAffectedTable?.table ?? ''"
    :classification-config="classificationConfig"
    @dismiss="selectedAffectedTable = undefined"
  />
</template>

<script lang="ts" setup>
import { ChevronDownIcon } from "lucide-vue-next";
import { NSwitch } from "naive-ui";
import { computed, reactive, watch, ref } from "vue";
import { BBSpin } from "@/bbkit";
import ChangeHistoryStatusIcon from "@/components/ChangeHistory/ChangeHistoryStatusIcon.vue";
import TableDetailDrawer from "@/components/TableDetailDrawer.vue";
import {
  pushNotification,
  useChangeHistoryStore,
  useDBSchemaV1Store,
  useDatabaseV1Store,
  useUserStore,
  useInstanceV1Store,
  useSettingV1Store,
} from "@/store";
import { AffectedTable } from "@/types/changeHistory";
import { Engine } from "@/types/proto/v1/common";
import {
  ChangeHistory,
  ChangeHistory_Type,
  changeHistory_SourceToJSON,
  changeHistory_TypeToJSON,
  DatabaseMetadataView,
  ChangeHistoryView,
} from "@/types/proto/v1/database_service";
import { PushEvent, VcsType, vcsTypeToJSON } from "@/types/proto/v1/vcs";
import {
  changeHistoryLink,
  extractIssueUID,
  extractUserResourceName,
  uidFromSlug,
  getAffectedTablesOfChangeHistory,
  toClipboard,
  getStatementSize,
} from "@/utils";

interface LocalState {
  showDiff: boolean;
  viewDrift: boolean;
  loading: boolean;
}

const props = defineProps<{
  instance: string;
  database: string;
  changeHistorySlug: string;
}>();

const state = reactive<LocalState>({
  showDiff: false,
  viewDrift: false,
  loading: false,
});

const databaseStore = useDatabaseV1Store();
const dbSchemaStore = useDBSchemaV1Store();
const instanceStore = useInstanceV1Store();
const settingStore = useSettingV1Store();
const changeHistoryStore = useChangeHistoryStore();
const selectedAffectedTable = ref<AffectedTable | undefined>();

const v1Instance = computed(() => {
  return instanceStore.getInstanceByName(`instances/${props.instance}`);
});

// eslint-disable-next-line vue/no-dupe-keys
const database = computed(() => {
  return databaseStore.getDatabaseByName(changeHistoryParent.value);
});

const classificationConfig = computed(() => {
  return settingStore.getProjectClassification(
    database.value.projectEntity.dataClassificationConfigId
  );
});

const changeHistoryParent = computed(() => {
  return `instances/${props.instance}/databases/${props.database}`;
});
const changeHistoryUID = computed(() => {
  return uidFromSlug(props.changeHistorySlug);
});
const changeHistoryName = computed(() => {
  return `${changeHistoryParent.value}/changeHistories/${changeHistoryUID.value}`;
});

const affectedTables = computed(() => {
  if (changeHistory.value === undefined) {
    return [];
  }
  return getAffectedTablesOfChangeHistory(changeHistory.value);
});

const showSchemaSnapshot = computed(() => {
  return v1Instance.value.engine !== Engine.RISINGWAVE;
});

watch(
  () => [changeHistoryParent.value, changeHistoryName.value],
  async () => {
    const database = await databaseStore.getOrFetchDatabaseByName(
      changeHistoryParent.value
    );
    await Promise.all([
      dbSchemaStore.getOrFetchDatabaseMetadata({
        database: database.name,
        skipCache: false,
        view: DatabaseMetadataView.DATABASE_METADATA_VIEW_BASIC,
      }),
      changeHistoryStore.fetchChangeHistoryList({
        parent: changeHistoryParent.value,
      }),
      changeHistoryStore.fetchChangeHistory({
        name: changeHistoryName.value,
      }),
    ]);
  },
  { immediate: true }
);

const fetchFullHistory = async () => {
  if (state.loading) {
    return;
  }
  state.loading = true;
  try {
    await changeHistoryStore.getOrFetchChangeHistoryByName(
      changeHistoryName.value,
      ChangeHistoryView.CHANGE_HISTORY_VIEW_FULL
    );
  } finally {
    state.loading = false;
  }
};

const switchShowDiff = async (showDiff: boolean) => {
  await fetchFullHistory();
  state.showDiff = showDiff;
};

const getAffectedTableDisplayName = (affectedTable: AffectedTable): string => {
  const { schema, table, dropped } = affectedTable;
  let name = table;
  if (schema !== "") {
    name = `${schema}.${table}`;
  }
  if (dropped) {
    name = `${name} (deleted)`;
  }
  return name;
};

const handleAffectedTableClick = (affectedTable: AffectedTable): void => {
  if (affectedTable.dropped) {
    return;
  }
  selectedAffectedTable.value = affectedTable;
};

// get all change histories before (include) the one of given id, ordered by descending version.
const prevChangeHistoryList = computed(() => {
  const changeHistoryList = changeHistoryStore.changeHistoryListByDatabase(
    changeHistoryParent.value
  );

  // The returned change history list has been ordered by `id` DESC or (`namespace` ASC, `sequence` DESC) .
  // We can obtain prevChangeHistoryList by cutting up the array by the `changeHistoryId`.
  const idx = changeHistoryList.findIndex(
    (history) => history.uid === changeHistoryUID.value
  );
  if (idx === -1) {
    return [];
  }
  return changeHistoryList.slice(idx);
});

// changeHistory is the latest migration NOW.
const changeHistory = computed((): ChangeHistory | undefined => {
  if (prevChangeHistoryList.value.length > 0) {
    const prev = prevChangeHistoryList.value[0];
    return changeHistoryStore.getChangeHistoryByName(prev.name) || prev;
  }
  return changeHistoryStore.getChangeHistoryByName(changeHistoryName.value)!;
});

const changeHistorySchema = computed(() => {
  if (!changeHistory.value) {
    return "";
  }
  let schema = changeHistory.value.schema;
  if (
    getStatementSize(changeHistory.value.schema).lt(
      changeHistory.value.schemaSize
    )
  ) {
    schema = `${schema}${schema.endsWith("\n") ? "" : "\n"}...`;
  }
  return schema;
});

const changeHistoryStatement = computed(() => {
  if (!changeHistory.value) {
    return "";
  }
  let statement = changeHistory.value.statement;
  if (
    getStatementSize(changeHistory.value.statement).lt(
      changeHistory.value.statementSize
    )
  ) {
    statement = `${statement}${statement.endsWith("\n") ? "" : "\n"}...`;
  }
  return statement;
});

// previousHistory is the last change history before the one of given id.
// Only referenced if hasDrift is true.
const previousHistory = computed((): ChangeHistory | undefined => {
  return prevChangeHistoryList.value[1];
});

// "Show diff" feature is enabled when current migration has changed the schema.
const allowShowDiff = computed((): boolean => {
  if (!changeHistory.value) {
    return false;
  }
  return true;
});

// A schema drift is detected when the schema AFTER previousHistory has been
// changed unexpectedly BEFORE current changeHistory.
const hasDrift = computed((): boolean => {
  if (!changeHistory.value) {
    return false;
  }
  if (changeHistory.value.type === ChangeHistory_Type.BASELINE) {
    return false;
  }

  return (
    prevChangeHistoryList.value.length > 1 && // no drift if no previous change history
    previousHistory.value?.schema !== changeHistory.value.prevSchema
  );
});

const creator = computed(() => {
  if (!changeHistory.value) {
    return undefined;
  }
  const email = extractUserResourceName(changeHistory.value.creator);
  return useUserStore().getUserByEmail(email);
});

const previousHistoryLink = computed(() => {
  const previous = previousHistory.value;
  if (!previous) return "";
  return changeHistoryLink(previous);
});

const pushEvent = computed((): PushEvent | undefined => {
  return changeHistory.value?.pushEvent;
});

const vcsCommit = computed(() => {
  const fileCommit = pushEvent.value?.fileCommit;
  if (fileCommit && fileCommit.id) {
    return fileCommit;
  }
  const commit = pushEvent.value?.commits[0];
  if (commit && commit.id) {
    return commit;
  }
  return undefined;
});

const vcsBranch = computed((): string => {
  if (pushEvent.value) {
    if (
      pushEvent.value.vcsType === VcsType.GITLAB ||
      pushEvent.value.vcsType === VcsType.GITHUB ||
      pushEvent.value.vcsType === VcsType.BITBUCKET
    ) {
      const parts = pushEvent.value.ref.split("/");
      return parts[parts.length - 1];
    }
  }
  return "";
});

const vcsBranchUrl = computed((): string => {
  if (pushEvent.value) {
    if (pushEvent.value.vcsType === VcsType.GITLAB) {
      return `${pushEvent.value.repositoryUrl}/-/tree/${vcsBranch.value}`;
    } else if (pushEvent.value.vcsType === VcsType.GITHUB) {
      return `${pushEvent.value.repositoryUrl}/tree/${vcsBranch.value}`;
    } else if (pushEvent.value.vcsType === VcsType.BITBUCKET) {
      return `${pushEvent.value.repositoryUrl}/src/${vcsBranch.value}`;
    }
  }
  return "";
});

const copyStatement = async () => {
  await fetchFullHistory();

  if (!changeHistoryStatement.value) {
    return false;
  }
  toClipboard(changeHistoryStatement.value).then(() => {
    pushNotification({
      module: "bytebase",
      style: "INFO",
      title: `Statement copied to clipboard.`,
    });
  });
};

const copySchema = async () => {
  await fetchFullHistory();

  if (!changeHistorySchema.value) {
    return false;
  }
  toClipboard(changeHistorySchema.value).then(() => {
    pushNotification({
      module: "bytebase",
      style: "INFO",
      title: `Schema copied to clipboard.`,
    });
  });
};
</script>
