import { useEffect, useRef, useState } from "react";

interface UseViewerLayoutOptions {
    propShowOutline?: boolean;
    propShowProperties?: boolean;
    setShowOutline: (value: boolean) => void;
    setShowProps: (value: boolean) => void;
}

export function useViewerLayout(options: UseViewerLayoutOptions) {
    const {
        propShowOutline,
        propShowProperties,
        setShowOutline,
        setShowProps
    } = options;

    const [leftWidth, setLeftWidth] = useState(260);
    const [rightWidth, setRightWidth] = useState(300);
    const resizingLeft = useRef(false);
    const resizingRight = useRef(false);

    useEffect(() => {
        if (propShowOutline !== undefined) {
            setShowOutline(propShowOutline);
        }
    }, [propShowOutline, setShowOutline]);

    useEffect(() => {
        if (propShowProperties !== undefined) {
            setShowProps(propShowProperties);
        }
    }, [propShowProperties, setShowProps]);

    useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            if (resizingLeft.current) {
                setLeftWidth(Math.max(150, Math.min(500, event.clientX)));
            }
            if (resizingRight.current) {
                const nextWidth = window.innerWidth - event.clientX;
                setRightWidth(Math.max(200, Math.min(600, nextWidth)));
            }
        };

        const handleUp = () => {
            resizingLeft.current = false;
            resizingRight.current = false;
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, []);

    return {
        leftWidth,
        rightWidth,
        resizingLeft,
        resizingRight
    };
}
