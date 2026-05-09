import React from "react";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight } from "../../theme/Icons";

export interface PaginationControlsProps {
  prevTitle: string;
  nextTitle: string;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  rightContent?: React.ReactNode;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  prevTitle,
  nextTitle,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  rightContent
}) => {
  return (
    <div className="ui-page-nav-wrap">
      <div className="ui-page-nav-group">
        <Button
          variant="ghost"
          className="ui-page-nav-btn"
          onClick={onPrev}
          disabled={currentPage <= 1}
          title={prevTitle}
          aria-label={prevTitle}
        >
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </Button>
        <span className="ui-page-nav-indicator">{currentPage}/{totalPages}</span>
        <Button
          variant="ghost"
          className="ui-page-nav-btn"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          title={nextTitle}
          aria-label={nextTitle}
        >
          <IconChevronRight size={20} strokeWidth={2.2} />
        </Button>
      </div>
      {rightContent && <div className="ui-page-nav-right">{rightContent}</div>}
    </div>
  );
};
