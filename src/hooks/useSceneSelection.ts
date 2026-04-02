import { useCallback, useMemo, useState } from "react";
import { getLastSelectedUuid, toggleUuidSelection } from "../viewer/selectionModel";

export function useSceneSelection() {
    const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
    const selectedUuid = useMemo(
        () => getLastSelectedUuid(selectedUuids),
        [selectedUuids]
    );

    const clearSelection = useCallback(() => {
        setSelectedUuids([]);
    }, []);

    const setSingleSelection = useCallback((uuid: string) => {
        setSelectedUuids([uuid]);
    }, []);

    const toggleSelection = useCallback((uuid: string) => {
        setSelectedUuids((prev) => toggleUuidSelection(prev, uuid));
    }, []);

    return {
        selectedUuids,
        selectedUuid,
        setSelectedUuids,
        clearSelection,
        setSingleSelection,
        toggleSelection
    };
}
