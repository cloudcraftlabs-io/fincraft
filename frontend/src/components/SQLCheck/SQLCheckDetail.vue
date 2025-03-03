<template>
  <div class="space-y-5 divide-y pb-5">
    <div
      v-for="(row, i) in tableRows"
      :key="i"
      class="pt-5 first:pt-2 space-y-2"
    >
      <div class="flex items-center space-x-3">
        <div
          class="relative w-5 h-5 flex flex-shrink-0 items-center justify-center rounded-full select-none"
          :class="statusIconClass(row.advice.status)"
        >
          <template v-if="row.advice.status === Advice_Status.SUCCESS">
            <heroicons-solid:check class="w-4 h-4" />
          </template>
          <template v-if="row.advice.status === Advice_Status.WARNING">
            <heroicons-outline:exclamation class="h-4 w-4" />
          </template>
          <template v-else-if="row.advice.status === Advice_Status.ERROR">
            <span class="text-white font-medium text-base" aria-hidden="true">
              !
            </span>
          </template>
        </div>
        <div v-if="showCategoryColumn">
          {{ row.category }}
        </div>
        <div class="font-semibold">{{ row.title }}</div>
      </div>
      <div class="textinfolabel">
        <span>{{ row.content }}</span>
        <template v-if="row.advice.detail">
          <span
            class="ml-1 normal-link"
            @click="state.activeResultDefinition = row.advice.detail"
            >{{ $t("sql-review.view-definition") }}</span
          >
          <span class="border-r border-control-border ml-1"></span>
        </template>
        <template v-if="getActiveRule(row.advice.title as RuleType)">
          <span
            class="ml-1 normal-link"
            @click="setActiveRule(row.advice.title as RuleType)"
            >{{ $t("sql-review.rule-detail") }}</span
          >
          <span class="border-r border-control-border ml-1"></span>
        </template>

        <a
          v-if="row.link"
          class="ml-1 normal-link"
          :href="row.link.url"
          :target="row.link.target"
        >
          {{ row.link.title }}
        </a>
      </div>
    </div>
  </div>

  <SQLRuleEditDialog
    v-if="state.activeRule"
    :editable="false"
    :rule="state.activeRule.rule"
    :payload="state.activeRule.payload"
    :disabled="true"
    @cancel="state.activeRule = undefined"
  />

  <PlanCheckResultDefinitionModal
    v-if="state.activeResultDefinition"
    :definition="state.activeResultDefinition"
    @cancel="state.activeResultDefinition = undefined"
  />
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { LocalizedSQLRuleErrorCodes } from "@/components/Issue/const";
import { SQLRuleEditDialog } from "@/components/SQLReview/components";
import { PayloadValueType } from "@/components/SQLReview/components/RuleConfigComponents";
import { useReviewPolicyByEnvironmentId } from "@/store";
import {
  ComposedDatabase,
  GeneralErrorCode,
  RuleTemplate,
  RuleType,
  SQLReviewPolicyErrorCode,
  findRuleTemplate,
  getRuleLocalization,
  ruleTemplateMap,
} from "@/types";
import { Advice, Advice_Status } from "@/types/proto/v1/sql_service";

interface ErrorCodeLink {
  title: string;
  target: string;
  url: string;
}

type PreviewSQLReviewRule = {
  rule: RuleTemplate;
  payload: PayloadValueType[];
};

type TableRow = {
  advice: Advice;
  category: string;
  title: string;
  content: string;
  link: ErrorCodeLink | undefined;
};

type LocalState = {
  activeRule?: PreviewSQLReviewRule;
  activeResultDefinition?: string;
};

const props = defineProps<{
  database: ComposedDatabase;
  advices: Advice[];
}>();

const { t } = useI18n();
const state = reactive<LocalState>({
  activeRule: undefined,
  activeResultDefinition: undefined,
});

const statusIconClass = (status: Advice_Status) => {
  switch (status) {
    case Advice_Status.SUCCESS:
      return "bg-success text-white";
    case Advice_Status.WARNING:
      return "bg-warning text-white";
    case Advice_Status.ERROR:
      return "bg-error text-white";
  }
};

const categoryAndTitle = (advice: Advice): [string, string] => {
  const code = advice.code;
  if (code === SQLReviewPolicyErrorCode.EMPTY_POLICY) {
    const title = messageWithCode(advice.title, code);
    return ["", title];
  }
  if (LocalizedSQLRuleErrorCodes.has(code)) {
    const rule = ruleTemplateMap.get(advice.title as RuleType);
    if (rule) {
      const ruleLocalization = getRuleLocalization(rule.type);
      const key = `sql-review.category.${rule.category.toLowerCase()}`;
      const category = t(key);
      const title = messageWithCode(ruleLocalization.title, code);
      return [category, title];
    } else {
      return ["", messageWithCode(advice.title, code)];
    }
  }
  return ["", advice.title];
};

const messageWithCode = (message: string, code: number) => {
  return `${message} #${code}`;
};

const errorCodeLink = (advice: Advice): ErrorCodeLink | undefined => {
  const code = advice.code;
  switch (code) {
    case undefined:
      return;
    case GeneralErrorCode.OK:
      return;
    case SQLReviewPolicyErrorCode.EMPTY_POLICY:
      return {
        title: t("sql-review.configure-policy"),
        target: "_self",
        url: "/setting/sql-review",
      };
    default: {
      const errorCodeNamespace = "advisor";
      const domain = "https://www.bytebase.com";
      const path = `/docs/reference/error-code/${errorCodeNamespace}/`;
      const query = `source=console#${code}`;
      const url = `${domain}${path}?${query}`;
      return {
        title: t("common.view-doc"),
        target: "__blank",
        url: url,
      };
    }
  }
};

const tableRows = computed(() => {
  return props.advices.map<TableRow>((advice) => {
    const [category, title] = categoryAndTitle(advice);
    const content = advice.content.trim();
    const link = errorCodeLink(advice);
    return {
      advice,
      category,
      title,
      content,
      link,
    };
  });
});

const showCategoryColumn = computed((): boolean =>
  tableRows.value.some((row) => row.category !== "")
);

const environmentUID = computed(
  () => props.database.effectiveEnvironmentEntity.uid
);
const reviewPolicy = useReviewPolicyByEnvironmentId(environmentUID);
const getActiveRule = (type: RuleType): PreviewSQLReviewRule | undefined => {
  const rule = reviewPolicy.value?.ruleList.find((rule) => rule.type === type);
  if (!rule) {
    return undefined;
  }

  const ruleTemplate = findRuleTemplate(type);
  if (!ruleTemplate) {
    return undefined;
  }
  ruleTemplate.comment = rule.comment;
  const { componentList } = ruleTemplate;
  const payload = componentList.reduce<PayloadValueType[]>(
    (list, component) => {
      list.push(component.payload.value ?? component.payload.default);
      return list;
    },
    []
  );

  return {
    rule: ruleTemplate,
    payload: payload,
  };
};
const setActiveRule = (type: RuleType) => {
  state.activeRule = getActiveRule(type);
};
</script>
