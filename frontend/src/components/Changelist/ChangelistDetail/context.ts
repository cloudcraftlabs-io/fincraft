import Emittery from "emittery";
import {
  InjectionKey,
  Ref,
  computed,
  inject,
  provide,
  ref,
  watchEffect,
} from "vue";
import { useRoute } from "vue-router";
import {
  useChangelistStore,
  useCurrentUserV1,
  useProjectV1Store,
} from "@/store";
import { projectNamePrefix } from "@/store/modules/v1/common";
import { ComposedProject, unknownChangelist, unknownProject } from "@/types";
import {
  Changelist,
  Changelist_Change as Change,
} from "@/types/proto/v1/changelist_service";
import {
  extractUserResourceName,
  hasWorkspacePermissionV1,
  isOwnerOfProjectV1,
} from "@/utils";

export type ChangelistDetailEvents = Emittery<{
  "reorder-cancel": undefined;
  "reorder-confirm": undefined;
}>;

export type ChangelistDetailContext = {
  changelist: Ref<Changelist>;
  project: Ref<ComposedProject>;
  allowEdit: Ref<boolean>;
  reorderMode: Ref<boolean>;
  selectedChanges: Ref<Change[]>;
  showAddChangePanel: Ref<boolean>;
  showApplyToDatabasePanel: Ref<boolean>;
  isUpdating: Ref<boolean>;

  events: ChangelistDetailEvents;
};

export const KEY = Symbol(
  "bb.changelist.detail"
) as InjectionKey<ChangelistDetailContext>;

export const useChangelistDetailContext = () => {
  return inject(KEY)!;
};

export const provideChangelistDetailContext = () => {
  const me = useCurrentUserV1();
  const route = useRoute();
  const projectV1Store = useProjectV1Store();

  const project = computed(() => {
    const projectId = route.params.projectId as string;
    if (!projectId) {
      return unknownProject();
    }

    return projectV1Store.getProjectByName(`${projectNamePrefix}${projectId}`);
  });

  const name = computed(() => {
    return `${project.value.name}/changelists/${route.params.changelistName}`;
  });

  watchEffect(async () => {
    await useChangelistStore().fetchChangelistByName(name.value);
  });

  const changelist = computed(() => {
    return (
      useChangelistStore().getChangelistByName(name.value) ??
      unknownChangelist()
    );
  });

  const allowEdit = computed(() => {
    if (
      hasWorkspacePermissionV1(
        "bb.permission.workspace.manage-issue",
        me.value.userRole
      )
    ) {
      // Allow workspace high-privileged user to edit all changelists.
      return true;
    }
    if (isOwnerOfProjectV1(project.value.iamPolicy, me.value)) {
      // Allow project owners to edit all changelists in the project.
      return true;
    }
    if (extractUserResourceName(changelist.value.creator) === me.value.email) {
      // Allow the initial creator of the changelist to edit it.
      return true;
    }
    // Disallowed to edit otherwise.
    return false;
  });

  const context: ChangelistDetailContext = {
    changelist,
    project,
    allowEdit,
    reorderMode: ref(false),
    selectedChanges: ref([]),
    showAddChangePanel: ref(false),
    showApplyToDatabasePanel: ref(false),
    isUpdating: ref(false),

    events: new Emittery(),
  };

  provide(KEY, context);

  return context;
};
