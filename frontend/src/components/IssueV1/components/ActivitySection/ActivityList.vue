<template>
  <div class="flex flex-col gap-y-4">
    <ul>
      <ActivityItem
        v-for="(item, index) in activityList"
        :key="item.activity.name"
        :activity-list="activityList"
        :issue="issue"
        :index="index"
        :activity="item.activity"
        :similar="item.similar"
      >
        <template v-if="allowEditActivity(item.activity)" #subject-suffix>
          <div class="space-x-2 flex items-center text-control-light">
            <!-- mr-2 is to vertical align with the text description edit button-->
            <div
              v-if="!state.editCommentMode"
              class="mr-2 flex items-center space-x-2"
            >
              <!-- Edit Comment Button-->
              <NButton
                quaternary
                size="tiny"
                @click.prevent="onUpdateComment(item.activity)"
              >
                <heroicons-outline:pencil class="w-4 h-4" />
              </NButton>
            </div>
          </div>
        </template>

        <template #comment>
          <MarkdownEditor
            v-if="item.activity.comment"
            :mode="
              state.editCommentMode &&
              state.activeActivity?.name === item.activity.name
                ? 'editor'
                : 'preview'
            "
            :content="item.activity.comment"
            :issue-list="issueList"
            @change="(val: string) => state.editComment = val"
            @submit="doUpdateComment"
            @cancel="cancelEditComment"
          />
          <div
            v-if="
              state.editCommentMode &&
              state.activeActivity?.name === item.activity.name
            "
            class="flex space-x-2 mt-4 items-center justify-end"
          >
            <NButton quaternary @click.prevent="cancelEditComment">
              {{ $t("common.cancel") }}
            </NButton>
            <NButton
              :disabled="!allowUpdateComment"
              @click.prevent="doUpdateComment"
            >
              {{ $t("common.save") }}
            </NButton>
          </div>
        </template>
      </ActivityItem>
    </ul>

    <div v-if="!state.editCommentMode">
      <div class="flex">
        <div class="flex-shrink-0">
          <div class="relative">
            <UserAvatar :user="currentUser" />
            <span
              class="absolute -bottom-0.5 -right-1 bg-white rounded-tl px-0.5 py-px"
            >
              <heroicons-solid:chat-alt
                class="h-3.5 w-3.5 text-control-light"
              />
            </span>
          </div>
        </div>
        <div class="ml-3 min-w-0 flex-1">
          <label for="comment" class="sr-only">
            {{ $t("issue.add-a-comment") }}
          </label>
          <MarkdownEditor
            mode="editor"
            :content="state.newComment"
            :issue-list="issueList"
            @change="(val: string) => state.newComment = val"
            @submit="doCreateComment(state.newComment)"
          />
          <div class="my-4 flex items-center justify-between">
            <NButton
              :disabled="state.newComment.length == 0"
              @click.prevent="doCreateComment(state.newComment)"
            >
              {{ $t("common.comment") }}
            </NButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import { IssueBuiltinFieldId } from "@/plugins";
import { useActivityV1Store, useCurrentUserV1, useIssueV1Store } from "@/store";
import { getLogId } from "@/store/modules/v1/common";
import {
  ActivityIssueCommentCreatePayload,
  ActivityIssueFieldUpdatePayload,
  UNKNOWN_PROJECT_NAME,
} from "@/types";
import type { ComposedIssue } from "@/types";
import { LogEntity, LogEntity_Action } from "@/types/proto/v1/logging_service";
import { extractUserResourceName } from "@/utils";
import { doSubscribeIssue, useIssueContext } from "../../logic";
import { ActivityItem, DistinctActivity, isSimilarActivity } from "./Activity";

interface LocalState {
  editCommentMode: boolean;
  activeActivity?: LogEntity;
  editComment: string;
  newComment: string;
}

const activityV1Store = useActivityV1Store();
const route = useRoute();

const { issue } = useIssueContext();
const issueList = ref<ComposedIssue[]>([]);

const state = reactive<LocalState>({
  editCommentMode: false,
  editComment: "",
  newComment: "",
});

const currentUser = useCurrentUserV1();
const issueV1Store = useIssueV1Store();

const prepareIssueListForMarkdownEditor = async () => {
  const project = issue.value.project;
  issueList.value = [];
  if (project === UNKNOWN_PROJECT_NAME) return;

  const list = await issueV1Store.listIssues({
    find: {
      project,
      query: "",
    },
  });
  issueList.value = list.issues;
};

const prepareActivityList = () => {
  activityV1Store.fetchActivityListForIssueV1(issue.value);
};

watchEffect(prepareActivityList);

// Need to use computed to make list reactive to activity list changes.
const activityList = computed((): DistinctActivity[] => {
  const list = activityV1Store
    .getActivityListByIssueV1(issue.value.uid)
    .filter((activity) => {
      if (activity.action === LogEntity_Action.ACTION_ISSUE_APPROVAL_NOTIFY) {
        return false;
      }

      if (activity.action === LogEntity_Action.ACTION_ISSUE_FIELD_UPDATE) {
        const containUserVisibleChange =
          (JSON.parse(activity.payload) as ActivityIssueFieldUpdatePayload)
            .fieldId !== IssueBuiltinFieldId.SUBSCRIBER_LIST;
        return containUserVisibleChange;
      }
      return true;
    });

  const distinctActivityList: DistinctActivity[] = [];
  for (let i = 0; i < list.length; i++) {
    const activity = list[i];
    if (distinctActivityList.length === 0) {
      distinctActivityList.push({ activity, similar: [] });
      continue;
    }

    const prev = distinctActivityList[distinctActivityList.length - 1];
    if (isSimilarActivity(prev.activity, activity)) {
      prev.similar.push(activity);
    } else {
      distinctActivityList.push({ activity, similar: [] });
    }
  }

  return distinctActivityList;
});

const cancelEditComment = () => {
  state.activeActivity = undefined;
  state.editCommentMode = false;
  state.editComment = "";
};

const doCreateComment = async (comment: string) => {
  await issueV1Store.createIssueComment({
    issueName: issue.value.name,
    issueId: issue.value.uid,
    comment,
  });
  state.newComment = "";

  await prepareActivityList();

  // // Because the user just added a comment and we assume she is interested in this
  // // issue, and we add her to the subscriber list if she is not there
  try {
    await doSubscribeIssue(issue.value, currentUser.value);
  } catch {
    // Nothing
  }
};

const allowEditActivity = (activity: LogEntity) => {
  if (activity.action !== LogEntity_Action.ACTION_ISSUE_COMMENT_CREATE) {
    return false;
  }
  if (currentUser.value.email !== extractUserResourceName(activity.creator)) {
    return false;
  }
  const payload = JSON.parse(
    activity.payload
  ) as ActivityIssueCommentCreatePayload;
  if (payload && payload.externalApprovalEvent) {
    return false;
  }
  return true;
};

const onUpdateComment = (activity: LogEntity) => {
  state.activeActivity = activity;
  state.editCommentMode = true;
  state.editComment = activity.comment;
};

const doUpdateComment = () => {
  if (!state.activeActivity) {
    return;
  }
  if (!state.editComment) {
    return;
  }
  const activityId = getLogId(state.activeActivity.name);
  issueV1Store
    .updateIssueComment({
      commentId: `${activityId}`,
      issueId: issue.value.uid,
      comment: state.editComment,
    })
    .then(() => {
      cancelEditComment();
    });
};

const allowUpdateComment = computed(() => {
  return (
    state.editComment && state.editComment != state.activeActivity!.comment
  );
});

onMounted(() => {
  watch(
    () => route.hash,
    (hash) => {
      if (hash.match(/^#activity(\d+)/)) {
        // use '#activity' element as a fallback
        const elem =
          document.querySelector(hash) || document.querySelector("#activity");
        // We use `setTimeout` here since this should be executed very late.
        setTimeout(() => elem?.scrollIntoView());
      }
    },
    {
      immediate: true,
    }
  );
});

watch(
  () => issue.value.project,
  () => {
    prepareIssueListForMarkdownEditor();
  },
  { immediate: true }
);
</script>
