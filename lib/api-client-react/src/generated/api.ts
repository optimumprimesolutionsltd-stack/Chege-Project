 number,) => {




  return `/api/savings-goals/${id}`
}

/**
 * @summary Delete a savings goal
 */
export const deleteSavingsGoal = async (id: number, options?: Parameters<typeof customFetch>[1]): Promise<SuccessResponse> => {

  return customFetch<SuccessResponse>(getDeleteSavingsGoalUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getDeleteSavingsGoalMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteSavingsGoal>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof deleteSavingsGoal>>, TError,{id: number}, TContext> => {

const mutationKey = ['deleteSavingsGoal'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof deleteSavingsGoal>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  deleteSavingsGoal(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type DeleteSavingsGoalMutationResult = NonNullable<Awaited<ReturnType<typeof deleteSavingsGoal>>>

    export type DeleteSavingsGoalMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Delete a savings goal
 */
export const useDeleteSavingsGoal = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteSavingsGoal>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof deleteSavingsGoal>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getDeleteSavingsGoalMutationOptions(options));
    }

export const getGetIncomeSourcesUrl = (params?: GetIncomeSourcesParams,) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {

    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0 ? `/api/income-sources?${stringifiedParams}` : `/api/income-sources`
}

/**
 * @summary List income source presets per household member
 */
export const getIncomeSources = async (params?: GetIncomeSourcesParams, options?: Parameters<typeof customFetch>[1]): Promise<IncomeSource[]> => {

  return customFetch<IncomeSource[]>(getGetIncomeSourcesUrl(params),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetIncomeSourcesQueryKey = (params?: GetIncomeSourcesParams,) => {
    return [
    `/api/income-sources`, ...(params ? [params] : [])
    ] as const;
    }


export const getGetIncomeSourcesQueryOptions = <TData = Awaited<ReturnType<typeof getIncomeSources>>, TError = ErrorType<ErrorResponse>>(params?: GetIncomeSourcesParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getIncomeSources>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetIncomeSourcesQueryKey(params);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getIncomeSources>>> = ({ signal }) => getIncomeSources(params, { signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getIncomeSources>>, TError, TData> & { queryKey: QueryKey }
}

export type GetIncomeSourcesQueryResult = NonNullable<Awaited<ReturnType<typeof getIncomeSources>>>
export type GetIncomeSourcesQueryError = ErrorType<ErrorResponse>


/**
 * @summary List income source presets per household member
 */

export function useGetIncomeSources<TData = Awaited<ReturnType<typeof getIncomeSources>>, TError = ErrorType<ErrorResponse>>(
 params?: GetIncomeSourcesParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getIncomeSources>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetIncomeSourcesQueryOptions(params,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetMembersUrl = () => {




  return `/api/members`
}

/**
 * @summary List all members with access to this app
 */
export const getMembers = async ( options?: Parameters<typeof customFetch>[1]): Promise<Member[]> => {

  return customFetch<Member[]>(getGetMembersUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetMembersQueryKey = () => {
    return [
    `/api/members`
    ] as const;
    }


export const getGetMembersQueryOptions = <TData = Awaited<ReturnType<typeof getMembers>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getMembers>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetMembersQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getMembers>>> = ({ signal }) => getMembers({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getMembers>>, TError, TData> & { queryKey: QueryKey }
}

export type GetMembersQueryResult = NonNullable<Awaited<ReturnType<typeof getMembers>>>
export type GetMembersQueryError = ErrorType<unknown>


/**
 * @summary List all members with access to this app
 */

export function useGetMembers<TData = Awaited<ReturnType<typeof getMembers>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getMembers>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetMembersQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getAddMemberUrl = () => {




  return `/api/members`
}

/**
 * @summary Invite a new member or admin by Replit user ID
 */
export const addMember = async (addMemberInput: AddMemberInput, options?: Parameters<typeof customFetch>[1]): Promise<Member> => {

  return customFetch<Member>(getAddMemberUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(addMemberInput)
  }
);}





export const getAddMemberMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof addMember>>, TError,{data: BodyType<AddMemberInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof addMember>>, TError,{data: BodyType<AddMemberInput>}, TContext> => {

const mutationKey = ['addMember'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof addMember>>, {data: BodyType<AddMemberInput>}> = (props) => {
          const {data} = props ?? {};

          return  addMember(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type AddMemberMutationResult = NonNullable<Awaited<ReturnType<typeof addMember>>>
    export type AddMemberMutationBody = BodyType<AddMemberInput>
    export type AddMemberMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Invite a new member or admin by Replit user ID
 */
export const useAddMember = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof addMember>>, TError,{data: BodyType<AddMemberInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof addMember>>,
        TError,
        {data: BodyType<AddMemberInput>},
        TContext
      > => {
      return useMutation(getAddMemberMutationOptions(options));
    }

export const getLeaveGroupUrl = () => {




  return `/api/members/me`
}

/**
 * @summary Leave the active group as the signed-in non-owner member
 */
export const leaveGroup = async ( options?: Parameters<typeof customFetch>[1]): Promise<SuccessResponse> => {

  return customFetch<SuccessResponse>(getLeaveGroupUrl(),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getLeaveGroupMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof leaveGroup>>, TError,void, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof leaveGroup>>, TError,void, TContext> => {

const mutationKey = ['leaveGroup'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof leaveGroup>>, void> = () => {


          return  leaveGroup(requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type LeaveGroupMutationResult = NonNullable<Awaited<ReturnType<typeof leaveGroup>>>

    export type LeaveGroupMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Leave the active group as the signed-in non-owner member
 */
export const useLeaveGroup = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof leaveGroup>>, TError,void, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof leaveGroup>>,
        TError,
        void,
        TContext
      > => {
      return useMutation(getLeaveGroupMutationOptions(options));
    }

export const getGetWorkspacesUrl = () => {




  return `/api/workspaces`
}

/**
 * @summary List the signed-in person's private and shared budget workspaces
 */
export const getWorkspaces = async ( options?: Parameters<typeof customFetch>[1]): Promise<Workspace[]> => {

  return customFetch<Workspace[]>(getGetWorkspacesUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetWorkspacesQueryKey = () => {
    return [
    `/api/workspaces`
    ] as const;
    }


export const getGetWorkspacesQueryOptions = <TData = Awaited<ReturnType<typeof getWorkspaces>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getWorkspaces>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetWorkspacesQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getWorkspaces>>> = ({ signal }) => getWorkspaces({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getWorkspaces>>, TError, TData> & { queryKey: QueryKey }
}

export type GetWorkspacesQueryResult = NonNullable<Awaited<ReturnType<typeof getWorkspaces>>>
export type GetWorkspacesQueryError = ErrorType<unknown>


/**
 * @summary List the signed-in person's private and shared budget workspaces
 */

export function useGetWorkspaces<TData = Awaited<ReturnType<typeof getWorkspaces>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getWorkspaces>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetWorkspacesQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getSelectWorkspaceUrl = () => {




  return `/api/workspaces/select`
}

/**
 * @summary Select an available workspace for the current session
 */
export const selectWorkspace = async (workspaceSelectionInput: WorkspaceSelectionInput, options?: Parameters<typeof customFetch>[1]): Promise<Workspace> => {

  return customFetch<Workspace>(getSelectWorkspaceUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(workspaceSelectionInput)
  }
);}





export const getSelectWorkspaceMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof selectWorkspace>>, TError,{data: BodyType<WorkspaceSelectionInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof selectWorkspace>>, TError,{data: BodyType<WorkspaceSelectionInput>}, TContext> => {

const mutationKey = ['selectWorkspace'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof selectWorkspace>>, {data: BodyType<WorkspaceSelectionInput>}> = (props) => {
          const {data} = props ?? {};

          return  selectWorkspace(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type SelectWorkspaceMutationResult = NonNullable<Awaited<ReturnType<typeof selectWorkspace>>>
    export type SelectWorkspaceMutationBody = BodyType<WorkspaceSelectionInput>
    export type SelectWorkspaceMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Select an available workspace for the current session
 */
export const useSelectWorkspace = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof selectWorkspace>>, TError,{data: BodyType<WorkspaceSelectionInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof selectWorkspace>>,
        TError,
        {data: BodyType<WorkspaceSelectionInput>},
        TContext
      > => {
      return useMutation(getSelectWorkspaceMutationOptions(options));
    }

export const getCreateSharedGroupUrl = () => {




  return `/api/groups`
}

/**
 * @summary Create a private shared group and become its owner
 */
export const createSharedGroup = async (sharedGroupInput: SharedGroupInput, options?: Parameters<typeof customFetch>[1]): Promise<Workspace> => {

  return customFetch<Workspace>(getCreateSharedGroupUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(sharedGroupInput)
  }
);}





export const getCreateSharedGroupMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createSharedGroup>>, TError,{data: BodyType<SharedGroupInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createSharedGroup>>, TError,{data: BodyType<SharedGroupInput>}, TContext> => {

const mutationKey = ['createSharedGroup'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createSharedGroup>>, {data: BodyType<SharedGroupInput>}> = (props) => {
          const {data} = props ?? {};

          return  createSharedGroup(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateSharedGroupMutationResult = NonNullable<Awaited<ReturnType<typeof createSharedGroup>>>
    export type CreateSharedGroupMutationBody = BodyType<SharedGroupInput>
    export type CreateSharedGroupMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Create a private shared group and become its owner
 */
export const useCreateSharedGroup = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createSharedGroup>>, TError,{data: BodyType<SharedGroupInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createSharedGroup>>,
        TError,
        {data: BodyType<SharedGroupInput>},
        TContext
      > => {
      return useMutation(getCreateSharedGroupMutationOptions(options));
    }

export const getGetGroupInvitationsUrl = () => {




  return `/api/group-invitations`
}

/**
 * @summary List group invitations
 */
export const getGroupInvitations = async ( options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitation[]> => {

  return customFetch<GroupInvitation[]>(getGetGroupInvitationsUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupInvitationsQueryKey = () => {
    return [
    `/api/group-invitations`
    ] as const;
    }


export const getGetGroupInvitationsQueryOptions = <TData = Awaited<ReturnType<typeof getGroupInvitations>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitations>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupInvitationsQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroupInvitations>>> = ({ signal }) => getGroupInvitations({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitations>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupInvitationsQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupInvitations>>>
export type GetGroupInvitationsQueryError = ErrorType<unknown>


/**
 * @summary List group invitations
 */

export function useGetGroupInvitations<TData = Awaited<ReturnType<typeof getGroupInvitations>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitations>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupInvitationsQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getCreateGroupInvitationUrl = () => {




  return `/api/group-invitations`
}

/**
 * @summary Email a group invitation
 */
export const createGroupInvitation = async (createGroupInvitationInput: CreateGroupInvitationInput, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitation> => {

  return customFetch<GroupInvitation>(getCreateGroupInvitationUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(createGroupInvitationInput)
  }
);}





export const getCreateGroupInvitationMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitation>>, TError,{data: BodyType<CreateGroupInvitationInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitation>>, TError,{data: BodyType<CreateGroupInvitationInput>}, TContext> => {

const mutationKey = ['createGroupInvitation'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createGroupInvitation>>, {data: BodyType<CreateGroupInvitationInput>}> = (props) => {
          const {data} = props ?? {};

          return  createGroupInvitation(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateGroupInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof createGroupInvitation>>>
    export type CreateGroupInvitationMutationBody = BodyType<CreateGroupInvitationInput>
    export type CreateGroupInvitationMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Email a group invitation
 */
export const useCreateGroupInvitation = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitation>>, TError,{data: BodyType<CreateGroupInvitationInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createGroupInvitation>>,
        TError,
        {data: BodyType<CreateGroupInvitationInput>},
        TContext
      > => {
      return useMutation(getCreateGroupInvitationMutationOptions(options));
    }

export const getCreateGroupInvitationsBatchUrl = () => {




  return `/api/group-invitations/batch`
}

/**
 * @summary Email several group invitations
 */
export const createGroupInvitationsBatch = async (createGroupInvitationsBatchInput: CreateGroupInvitationsBatchInput, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationsBatchResult> => {

  return customFetch<GroupInvitationsBatchResult>(getCreateGroupInvitationsBatchUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(createGroupInvitationsBatchInput)
  }
);}





export const getCreateGroupInvitationsBatchMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitationsBatch>>, TError,{data: BodyType<CreateGroupInvitationsBatchInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitationsBatch>>, TError,{data: BodyType<CreateGroupInvitationsBatchInput>}, TContext> => {

const mutationKey = ['createGroupInvitationsBatch'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createGroupInvitationsBatch>>, {data: BodyType<CreateGroupInvitationsBatchInput>}> = (props) => {
          const {data} = props ?? {};

          return  createGroupInvitationsBatch(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateGroupInvitationsBatchMutationResult = NonNullable<Awaited<ReturnType<typeof createGroupInvitationsBatch>>>
    export type CreateGroupInvitationsBatchMutationBody = BodyType<CreateGroupInvitationsBatchInput>
    export type CreateGroupInvitationsBatchMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Email several group invitations
 */
export const useCreateGroupInvitationsBatch = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInvitationsBatch>>, TError,{data: BodyType<CreateGroupInvitationsBatchInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createGroupInvitationsBatch>>,
        TError,
        {data: BodyType<CreateGroupInvitationsBatchInput>},
        TContext
      > => {
      return useMutation(getCreateGroupInvitationsBatchMutationOptions(options));
    }

export const getGetGroupInviteLinksUrl = () => {




  return `/api/group-invite-links`
}

/**
 * @summary List private join links for the active shared group
 */
export const getGroupInviteLinks = async ( options?: Parameters<typeof customFetch>[1]): Promise<GroupInviteLink[]> => {

  return customFetch<GroupInviteLink[]>(getGetGroupInviteLinksUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupInviteLinksQueryKey = () => {
    return [
    `/api/group-invite-links`
    ] as const;
    }


export const getGetGroupInviteLinksQueryOptions = <TData = Awaited<ReturnType<typeof getGroupInviteLinks>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinks>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupInviteLinksQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroupInviteLinks>>> = ({ signal }) => getGroupInviteLinks({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinks>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupInviteLinksQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupInviteLinks>>>
export type GetGroupInviteLinksQueryError = ErrorType<unknown>


/**
 * @summary List private join links for the active shared group
 */

export function useGetGroupInviteLinks<TData = Awaited<ReturnType<typeof getGroupInviteLinks>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinks>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupInviteLinksQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getCreateGroupInviteLinkUrl = () => {




  return `/api/group-invite-links`
}

/**
 * @summary Create an expiring private join link for the active shared group
 */
export const createGroupInviteLink = async ( options?: Parameters<typeof customFetch>[1]): Promise<GroupInviteLinkCreated> => {

  return customFetch<GroupInviteLinkCreated>(getCreateGroupInviteLinkUrl(),
  {
    ...options,
    method: 'POST'


  }
);}





export const getCreateGroupInviteLinkMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInviteLink>>, TError,void, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createGroupInviteLink>>, TError,void, TContext> => {

const mutationKey = ['createGroupInviteLink'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createGroupInviteLink>>, void> = () => {


          return  createGroupInviteLink(requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateGroupInviteLinkMutationResult = NonNullable<Awaited<ReturnType<typeof createGroupInviteLink>>>

    export type CreateGroupInviteLinkMutationError = ErrorType<unknown>

    /**
 * @summary Create an expiring private join link for the active shared group
 */
export const useCreateGroupInviteLink = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createGroupInviteLink>>, TError,void, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createGroupInviteLink>>,
        TError,
        void,
        TContext
      > => {
      return useMutation(getCreateGroupInviteLinkMutationOptions(options));
    }

export const getRevokeGroupInviteLinkUrl = (id: number,) => {




  return `/api/group-invite-links/${id}`
}

/**
 * @summary Revoke a private group join link
 */
export const revokeGroupInviteLink = async (id: number, options?: Parameters<typeof customFetch>[1]): Promise<GroupInviteLink> => {

  return customFetch<GroupInviteLink>(getRevokeGroupInviteLinkUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getRevokeGroupInviteLinkMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof revokeGroupInviteLink>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof revokeGroupInviteLink>>, TError,{id: number}, TContext> => {

const mutationKey = ['revokeGroupInviteLink'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof revokeGroupInviteLink>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  revokeGroupInviteLink(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type RevokeGroupInviteLinkMutationResult = NonNullable<Awaited<ReturnType<typeof revokeGroupInviteLink>>>

    export type RevokeGroupInviteLinkMutationError = ErrorType<unknown>

    /**
 * @summary Revoke a private group join link
 */
export const useRevokeGroupInviteLink = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof revokeGroupInviteLink>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof revokeGroupInviteLink>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getRevokeGroupInviteLinkMutationOptions(options));
    }

export const getGetGroupInviteLinkPreviewUrl = (token: string,) => {




  return `/api/group-invite-links/accept/${token}`
}

/**
 * @summary Preview a private group join link
 */
export const getGroupInviteLinkPreview = async (token: string, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationPreview> => {

  return customFetch<GroupInvitationPreview>(getGetGroupInviteLinkPreviewUrl(token),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupInviteLinkPreviewQueryKey = (token: string,) => {
    return [
    `/api/group-invite-links/accept/${token}`
    ] as const;
    }


export const getGetGroupInviteLinkPreviewQueryOptions = <TData = Awaited<ReturnType<typeof getGroupInviteLinkPreview>>, TError = ErrorType<ErrorResponse>>(token: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinkPreview>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupInviteLinkPreviewQueryKey(token);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroupInviteLinkPreview>>> = ({ signal }) => getGroupInviteLinkPreview(token, { signal, ...requestOptions });





   return  { queryKey, queryFn, enabled: token !== null && token !== undefined, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinkPreview>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupInviteLinkPreviewQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupInviteLinkPreview>>>
export type GetGroupInviteLinkPreviewQueryError = ErrorType<ErrorResponse>


/**
 * @summary Preview a private group join link
 */

export function useGetGroupInviteLinkPreview<TData = Awaited<ReturnType<typeof getGroupInviteLinkPreview>>, TError = ErrorType<ErrorResponse>>(
 token: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInviteLinkPreview>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupInviteLinkPreviewQueryOptions(token,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getAcceptGroupInviteLinkUrl = (token: string,) => {




  return `/api/group-invite-links/accept/${token}`
}

/**
 * @summary Join a private group using a valid private link
 */
export const acceptGroupInviteLink = async (token: string, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationPreview> => {

  return customFetch<GroupInvitationPreview>(getAcceptGroupInviteLinkUrl(token),
  {
    ...options,
    method: 'POST'


  }
);}





export const getAcceptGroupInviteLinkMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInviteLink>>, TError,{token: string}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInviteLink>>, TError,{token: string}, TContext> => {

const mutationKey = ['acceptGroupInviteLink'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof acceptGroupInviteLink>>, {token: string}> = (props) => {
          const {token} = props ?? {};

          return  acceptGroupInviteLink(token,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type AcceptGroupInviteLinkMutationResult = NonNullable<Awaited<ReturnType<typeof acceptGroupInviteLink>>>

    export type AcceptGroupInviteLinkMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Join a private group using a valid private link
 */
export const useAcceptGroupInviteLink = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInviteLink>>, TError,{token: string}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof acceptGroupInviteLink>>,
        TError,
        {token: string},
        TContext
      > => {
      return useMutation(getAcceptGroupInviteLinkMutationOptions(options));
    }

export const getCancelGroupInvitationUrl = (id: number,) => {




  return `/api/group-invitations/${id}`
}

/**
 * @summary Cancel a pending group invitation
 */
export const cancelGroupInvitation = async (id: number, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitation> => {

  return customFetch<GroupInvitation>(getCancelGroupInvitationUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getCancelGroupInvitationMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof cancelGroupInvitation>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof cancelGroupInvitation>>, TError,{id: number}, TContext> => {

const mutationKey = ['cancelGroupInvitation'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof cancelGroupInvitation>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  cancelGroupInvitation(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CancelGroupInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof cancelGroupInvitation>>>

    export type CancelGroupInvitationMutationError = ErrorType<unknown>

    /**
 * @summary Cancel a pending group invitation
 */
export const useCancelGroupInvitation = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof cancelGroupInvitation>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof cancelGroupInvitation>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getCancelGroupInvitationMutationOptions(options));
    }

export const getResendGroupInvitationUrl = (id: number,) => {




  return `/api/group-invitations/${id}/resend`
}

/**
 * @summary Send a fresh link for a pending invitation
 */
export const resendGroupInvitation = async (id: number, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitation> => {

  return customFetch<GroupInvitation>(getResendGroupInvitationUrl(id),
  {
    ...options,
    method: 'POST'


  }
);}





export const getResendGroupInvitationMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof resendGroupInvitation>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof resendGroupInvitation>>, TError,{id: number}, TContext> => {

const mutationKey = ['resendGroupInvitation'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof resendGroupInvitation>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  resendGroupInvitation(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type ResendGroupInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof resendGroupInvitation>>>

    export type ResendGroupInvitationMutationError = ErrorType<unknown>

    /**
 * @summary Send a fresh link for a pending invitation
 */
export const useResendGroupInvitation = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof resendGroupInvitation>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof resendGroupInvitation>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getResendGroupInvitationMutationOptions(options));
    }

export const getGetGroupInvitationPreviewUrl = (token: string,) => {




  return `/api/group-invitations/accept/${token}`
}

/**
 * @summary Preview a valid invitation before signing in
 */
export const getGroupInvitationPreview = async (token: string, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationPreview> => {

  return customFetch<GroupInvitationPreview>(getGetGroupInvitationPreviewUrl(token),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupInvitationPreviewQueryKey = (token: string,) => {
    return [
    `/api/group-invitations/accept/${token}`
    ] as const;
    }


export const getGetGroupInvitationPreviewQueryOptions = <TData = Awaited<ReturnType<typeof getGroupInvitationPreview>>, TError = ErrorType<void>>(token: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationPreview>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupInvitationPreviewQueryKey(token);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroupInvitationPreview>>> = ({ signal }) => getGroupInvitationPreview(token, { signal, ...requestOptions });





   return  { queryKey, queryFn, enabled: token !== null && token !== undefined, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationPreview>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupInvitationPreviewQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupInvitationPreview>>>
export type GetGroupInvitationPreviewQueryError = ErrorType<void>


/**
 * @summary Preview a valid invitation before signing in
 */

export function useGetGroupInvitationPreview<TData = Awaited<ReturnType<typeof getGroupInvitationPreview>>, TError = ErrorType<void>>(
 token: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationPreview>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupInvitationPreviewQueryOptions(token,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getAcceptGroupInvitationUrl = (token: string,) => {




  return `/api/group-invitations/accept/${token}`
}

/**
 * @summary Accept an invitation with the matching signed-in email
 */
export const acceptGroupInvitation = async (token: string, options?: Parameters<typeof customFetch>[1]): Promise<void> => {

  return customFetch<void>(getAcceptGroupInvitationUrl(token),
  {
    ...options,
    method: 'POST'


  }
);}





export const getAcceptGroupInvitationMutationOptions = <TError = ErrorType<void>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInvitation>>, TError,{token: string}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInvitation>>, TError,{token: string}, TContext> => {

const mutationKey = ['acceptGroupInvitation'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof acceptGroupInvitation>>, {token: string}> = (props) => {
          const {token} = props ?? {};

          return  acceptGroupInvitation(token,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type AcceptGroupInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof acceptGroupInvitation>>>

    export type AcceptGroupInvitationMutationError = ErrorType<void>

    /**
 * @summary Accept an invitation with the matching signed-in email
 */
export const useAcceptGroupInvitation = <TError = ErrorType<void>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof acceptGroupInvitation>>, TError,{token: string}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof acceptGroupInvitation>>,
        TError,
        {token: string},
        TContext
      > => {
      return useMutation(getAcceptGroupInvitationMutationOptions(options));
    }

export const getGetGroupInvitationContactsUrl = () => {




  return `/api/group-invitation-contacts`
}

/**
 * @summary List saved one-tap invitation contacts
 */
export const getGroupInvitationContacts = async ( options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationContact[]> => {

  return customFetch<GroupInvitationContact[]>(getGetGroupInvitationContactsUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupInvitationContactsQueryKey = () => {
    return [
    `/api/group-invitation-contacts`
    ] as const;
    }


export const getGetGroupInvitationContactsQueryOptions = <TData = Awaited<ReturnType<typeof getGroupInvitationContacts>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationContacts>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupInvitationContactsQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroupInvitationContacts>>> = ({ signal }) => getGroupInvitationContacts({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationContacts>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupInvitationContactsQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupInvitationContacts>>>
export type GetGroupInvitationContactsQueryError = ErrorType<unknown>


/**
 * @summary List saved one-tap invitation contacts
 */

export function useGetGroupInvitationContacts<TData = Awaited<ReturnType<typeof getGroupInvitationContacts>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroupInvitationContacts>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupInvitationContactsQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getSaveGroupInvitationContactUrl = () => {




  return `/api/group-invitation-contacts`
}

/**
 * @summary Save or update a one-tap invitation contact
 */
export const saveGroupInvitationContact = async (groupInvitationContactInput: GroupInvitationContactInput, options?: Parameters<typeof customFetch>[1]): Promise<GroupInvitationContact> => {

  return customFetch<GroupInvitationContact>(getSaveGroupInvitationContactUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(groupInvitationContactInput)
  }
);}





export const getSaveGroupInvitationContactMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof saveGroupInvitationContact>>, TError,{data: BodyType<GroupInvitationContactInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof saveGroupInvitationContact>>, TError,{data: BodyType<GroupInvitationContactInput>}, TContext> => {

const mutationKey = ['saveGroupInvitationContact'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof saveGroupInvitationContact>>, {data: BodyType<GroupInvitationContactInput>}> = (props) => {
          const {data} = props ?? {};

          return  saveGroupInvitationContact(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type SaveGroupInvitationContactMutationResult = NonNullable<Awaited<ReturnType<typeof saveGroupInvitationContact>>>
    export type SaveGroupInvitationContactMutationBody = BodyType<GroupInvitationContactInput>
    export type SaveGroupInvitationContactMutationError = ErrorType<unknown>

    /**
 * @summary Save or update a one-tap invitation contact
 */
export const useSaveGroupInvitationContact = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof saveGroupInvitationContact>>, TError,{data: BodyType<GroupInvitationContactInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof saveGroupInvitationContact>>,
        TError,
        {data: BodyType<GroupInvitationContactInput>},
        TContext
      > => {
      return useMutation(getSaveGroupInvitationContactMutationOptions(options));
    }

export const getDeleteGroupInvitationContactUrl = (id: number,) => {




  return `/api/group-invitation-contacts/${id}`
}

/**
 * @summary Delete a saved invitation contact
 */
export const deleteGroupInvitationContact = async (id: number, options?: Parameters<typeof customFetch>[1]): Promise<void> => {

  return customFetch<void>(getDeleteGroupInvitationContactUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getDeleteGroupInvitationContactMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteGroupInvitationContact>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof deleteGroupInvitationContact>>, TError,{id: number}, TContext> => {

const mutationKey = ['deleteGroupInvitationContact'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof deleteGroupInvitationContact>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  deleteGroupInvitationContact(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type DeleteGroupInvitationContactMutationResult = NonNullable<Awaited<ReturnType<typeof deleteGroupInvitationContact>>>

    export type DeleteGroupInvitationContactMutationError = ErrorType<unknown>

    /**
 * @summary Delete a saved invitation contact
 */
export const useDeleteGroupInvitationContact = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteGroupInvitationContact>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof deleteGroupInvitationContact>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getDeleteGroupInvitationContactMutationOptions(options));
    }

export const getGetGroupUrl = () => {




  return `/api/group`
}

/**
 * @summary Get the active group's details
 */
export const getGroup = async ( options?: Parameters<typeof customFetch>[1]): Promise<Group> => {

  return customFetch<Group>(getGetGroupUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetGroupQueryKey = () => {
    return [
    `/api/group`
    ] as const;
    }


export const getGetGroupQueryOptions = <TData = Awaited<ReturnType<typeof getGroup>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroup>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetGroupQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getGroup>>> = ({ signal }) => getGroup({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getGroup>>, TError, TData> & { queryKey: QueryKey }
}

export type GetGroupQueryResult = NonNullable<Awaited<ReturnType<typeof getGroup>>>
export type GetGroupQueryError = ErrorType<unknown>


/**
 * @summary Get the active group's details
 */

export function useGetGroup<TData = Awaited<ReturnType<typeof getGroup>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getGroup>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetGroupQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getUpdateGroupUrl = () => {




  return `/api/group`
}

/**
 * @summary Rename the active group
 */
export const updateGroup = async (updateGroupInput: UpdateGroupInput, options?: Parameters<typeof customFetch>[1]): Promise<Group> => {

  return customFetch<Group>(getUpdateGroupUrl(),
  {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(updateGroupInput)
  }
);}





export const getUpdateGroupMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError,{data: BodyType<UpdateGroupInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError,{data: BodyType<UpdateGroupInput>}, TContext> => {

const mutationKey = ['updateGroup'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateGroup>>, {data: BodyType<UpdateGroupInput>}> = (props) => {
          const {data} = props ?? {};

          return  updateGroup(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type UpdateGroupMutationResult = NonNullable<Awaited<ReturnType<typeof updateGroup>>>
    export type UpdateGroupMutationBody = BodyType<UpdateGroupInput>
    export type UpdateGroupMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Rename the active group
 */
export const useUpdateGroup = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError,{data: BodyType<UpdateGroupInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof updateGroup>>,
        TError,
        {data: BodyType<UpdateGroupInput>},
        TContext
      > => {
      return useMutation(getUpdateGroupMutationOptions(options));
    }

export const getUpdateMemberRoleUrl = (userId: string,) => {




  return `/api/members/${userId}`
}

/**
 * @summary Promote or demote a member
 */
export const updateMemberRole = async (userId: string,
    updateMemberRoleInput: UpdateMemberRoleInput, options?: Parameters<typeof customFetch>[1]): Promise<Member> => {

  return customFetch<Member>(getUpdateMemberRoleUrl(userId),
  {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(updateMemberRoleInput)
  }
);}





export const getUpdateMemberRoleMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateMemberRole>>, TError,{userId: string;data: BodyType<UpdateMemberRoleInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof updateMemberRole>>, TError,{userId: string;data: BodyType<UpdateMemberRoleInput>}, TContext> => {

const mutationKey = ['updateMemberRole'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateMemberRole>>, {userId: string;data: BodyType<UpdateMemberRoleInput>}> = (props) => {
          const {userId,data} = props ?? {};

          return  updateMemberRole(userId,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type UpdateMemberRoleMutationResult = NonNullable<Awaited<ReturnType<typeof updateMemberRole>>>
    export type UpdateMemberRoleMutationBody = BodyType<UpdateMemberRoleInput>
    export type UpdateMemberRoleMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Promote or demote a member
 */
export const useUpdateMemberRole = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateMemberRole>>, TError,{userId: string;data: BodyType<UpdateMemberRoleInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof updateMemberRole>>,
        TError,
        {userId: string;data: BodyType<UpdateMemberRoleInput>},
        TContext
      > => {
      return useMutation(getUpdateMemberRoleMutationOptions(options));
    }

export const getRemoveMemberUrl = (userId: string,) => {




  return `/api/members/${userId}`
}

/**
 * @summary Remove a member
 */
export const removeMember = async (userId: string, options?: Parameters<typeof customFetch>[1]): Promise<SuccessResponse> => {

  return customFetch<SuccessResponse>(getRemoveMemberUrl(userId),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getRemoveMemberMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof removeMember>>, TError,{userId: string}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof removeMember>>, TError,{userId: string}, TContext> => {

const mutationKey = ['removeMember'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof removeMember>>, {userId: string}> = (props) => {
          const {userId} = props ?? {};

          return  removeMember(userId,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type RemoveMemberMutationResult = NonNullable<Awaited<ReturnType<typeof removeMember>>>

    export type RemoveMemberMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Remove a member
 */
export const useRemoveMember = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof removeMember>>, TError,{userId: string}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof removeMember>>,
        TError,
        {userId: string},
        TContext
      > => {
      return useMutation(getRemoveMemberMutationOptions(options));
    }

