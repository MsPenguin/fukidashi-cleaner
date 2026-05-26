import type { ImageItem } from "../app-types";

type ImageThumbnailListProps = {
  items: ImageItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRemove: (itemId: string) => void;
};

export default function ImageThumbnailList({
  items,
  selectedIndex,
  onSelect,
  onRemove,
}: ImageThumbnailListProps) {
  return (
    <div className="thumbnails">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`thumb ${index === selectedIndex ? "selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(index);
            }
          }}
        >
          <button
            type="button"
            className="thumb-remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.id);
            }}
            aria-label={`${item.name} 제거`}
            title="이 항목 제거"
          >
            ×
          </button>
          {item.url ? (
            <img src={item.url} alt={item.name} />
          ) : (
            <div className="thumb-empty">로딩 중</div>
          )}
          <div className="name">{item.name}</div>
        </div>
      ))}
    </div>
  );
}
