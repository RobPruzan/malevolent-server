import { atom } from "jotai";
import {
  UseQueryOptions,
  UseSuspenseQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { client } from "@/edenClient";
import { useToast } from "../ui/use-toast";

import {
  FiresideUser,
  useUserQuery,
  userQueryOptions,
} from "@/lib/useUserQuery";
import { useSetAtom } from "jotai";
import { Nullish } from "@fireside/utils";
import { FiresideCamp } from "@fireside/db";

import {
  AnyRoute,
  RegisteredRouter,
  RoutePaths,
  LinkProps,
  Link,
} from "@tanstack/react-router";

import { RefAttributes } from "react";

export const dynamicSideBarOpen = atom(true);
export const createCampModalOpen = atom(false);

// export const MenuItem = <
//   TRouteTree extends AnyRoute = RegisteredRouter["routeTree"],
//   TFrom extends RoutePaths<TRouteTree> | string = string,
//   TTo extends string = "",
//   TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
//   TMaskTo extends string = "",
// >(
//   props: LinkProps<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
//     RefAttributes<HTMLAnchorElement> & {
//       label: string;
//     }
// ) => (
//   <Link
//     {...props}
//     className="pb-0.5"
//     activeProps={{ className: "border-b-[3px] border-primary " }}
//     activeOptions={{ exact: false, includeHash: true, includeSearch: true }}
//   >
//     {props.label}
//   </Link>
// );

export const useDefinedUser = (opts?: Opts) => {
  const user = useSuspenseQuery(userQueryOptions).data;

  const shouldBeDefinedUser = opts?.user ?? user;
  if (!shouldBeDefinedUser) {
    throw new Error(
      "Must ensure at route level user is authorized, or provide a non null user as an argument"
    );
  }

  return shouldBeDefinedUser;
};

type Opts = { user?: FiresideUser };

export const useCreateCampMutation = () => {
  const { toast } = useToast();
  const setModalOpen = useSetAtom(createCampModalOpen);

  const { allCampsQueryKey } = useAllCamps();
  const { campsQueryKey } = useUserCamps();

  const { setQueryData } = useQueryClient();

  const createCampMutation = useMutation({
    mutationKey: ["create-camp"],
    mutationFn: async (createOps: { name: string }) => {
      const res = await client.api.protected.camp.create.post(createOps);
      if (res.error) {
        throw Error(res.error.value);
      }

      return res.data;
    },
    onSuccess: (camp) => {
      setQueryData(campsQueryKey, (prev) => (prev ? [...prev, camp] : [camp]));
      setQueryData(allCampsQueryKey, (prev) =>
        prev ? [...(prev ?? []), camp] : [camp]
      );
      setModalOpen(false);
    },
    onError: () =>
      toast({ title: "Failed to create camp", variant: "destructive" }),
  });

  return createCampMutation;
};

export const getUserCampQueryOptions = ({
  userId,
}: {
  userId: Nullish<string>;
}) =>
  queryOptions({
    queryFn: async () => {
      const res = await client.api.protected.camp.retrieve.me.get();
      if (res.error) {
        throw new Error(res.error.value);
      }
      return res.data;
    },
    queryKey: ["camps", userId],
    enabled: !!userId,
  });

export const useCampsQuery = () => {
  const user = useUserQuery();

  return useQuery(getUserCampQueryOptions({ userId: user.data?.id }));
};

export const useUserCamps = (opts?: Opts) => {
  const user = useDefinedUser(opts);
  const options = getUserCampQueryOptions({ userId: user.id });
  const queryClient = useQueryClient();

  const campsQuery = useSuspenseQuery(options);

  return {
    camps: campsQuery.data,
    query: campsQuery,
    campsQueryKey: options.queryKey,
  };
};

export const useJoinCampMutation = () => {
  const { toast } = useToast();
  const { allCampsQueryKey } = useAllCamps();
  const { campsQueryKey } = useUserCamps();
  const { setQueryData } = useQueryClient();
  const joinCampMutation = useMutation({
    mutationFn: async (joinCampOpts: { campId: string }) => {
      const res = await client.api.protected.camp.join[
        joinCampOpts.campId
      ].post();
      if (res.error) {
        throw new Error(res.error.value);
      }

      return res.data;
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Couldn't join camp",
        description: e.message,
      });
    },
    onSuccess: (joinedCamp) => {
      setQueryData(campsQueryKey, (prev) => {
        return !prev ? [joinedCamp] : [...prev, joinedCamp];
      });
      setQueryData(allCampsQueryKey, (prev) => {
        return prev?.map((camp) =>
          camp.id === joinedCamp.id ? { ...camp, count: camp.count + 1 } : camp
        );
      });
    },
  });

  return joinCampMutation;
};

export const getAllCampsQueryOptions = ({ userId }: { userId: string }) =>
  queryOptions({
    queryKey: ["all-camps", userId],
    queryFn: async () => {
      const res = await client.api.protected.camp.retrieve.get();
      if (res.error) {
        throw new Error(res.error.value);
      }

      return res.data;
    },
  });
export const useAllCamps = () => {
  const user = useDefinedUser();
  const options = getAllCampsQueryOptions({ userId: user.id });
  const queryClient = useQueryClient();

  const allCampsQuery = useSuspenseQuery(options);

  return {
    camps: allCampsQuery.data,
    query: allCampsQuery,
    allCampsQueryKey: options.queryKey,
  };
};
