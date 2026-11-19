import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isDocmeDataError } from "@/features/data/errors";
import type { RepoLinkInput } from "./repo-link";
import { getDocSource, removeDocSource, saveDocSource } from "./services";

export const SOURCE_KEYS = {
  all: ["docSource"] as const,
  ofDoc: (docId: string) => ["docSource", docId] as const,
};

export function useDocSource(docId: string, enabled = true) {
  return useQuery({
    queryKey: SOURCE_KEYS.ofDoc(docId),
    queryFn: () => getDocSource(docId),
    enabled: !!docId && enabled,
    retry: (count, error) => !isDocmeDataError(error, "Forbidden") && count < 3,
  });
}

export function useSaveDocSource(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RepoLinkInput) => saveDocSource(docId, input),
    onSuccess: (source) => qc.setQueryData(SOURCE_KEYS.ofDoc(docId), source),
    onSettled: () => qc.invalidateQueries({ queryKey: SOURCE_KEYS.ofDoc(docId) }),
  });
}

export function useRemoveDocSource(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeDocSource(docId),
    onSuccess: () => qc.setQueryData(SOURCE_KEYS.ofDoc(docId), null),
    onSettled: () => qc.invalidateQueries({ queryKey: SOURCE_KEYS.ofDoc(docId) }),
  });
}
