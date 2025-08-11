'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Lock, Unlock, Tag, Save, X } from 'lucide-react';

interface ManualTag {
  id: number;
  tag_key: string;
  tag_value: string;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface ManualTagsProps {
  ownerId: number;
  onTagsChange?: () => void; // Callback pre refresh výsledkov
}

export function ManualTags({ ownerId, onTagsChange }: ManualTagsProps) {
  const [tags, setTags] = useState<ManualTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<number | null>(null);
  const [newTag, setNewTag] = useState({ key: '', value: '', is_locked: false });
  const [showAddForm, setShowAddForm] = useState(false);

  // Načítanie tagov
  const fetchTags = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/manual-tags?owner_id=${ownerId}`);
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      } else {
        console.error('Chyba pri načítavaní tagov:', response.statusText);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní tagov:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, [ownerId]);

  // Pridanie nového tagu
  const handleAddTag = async () => {
    if (!newTag.key.trim() || !newTag.value.trim()) {
      alert('Kľúč a hodnota tagu sú povinné');
      return;
    }

    try {
      const response = await fetch('/api/manual-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: ownerId,
          tag_key: newTag.key.trim(),
          tag_value: newTag.value.trim(),
          is_locked: newTag.is_locked
        })
      });

      if (response.ok) {
        await fetchTags();
        setNewTag({ key: '', value: '', is_locked: false });
        setShowAddForm(false);
        onTagsChange?.();
      } else {
        const error = await response.json();
        alert(`Chyba pri pridávaní tagu: ${error.error}`);
      }
    } catch (error) {
      console.error('Chyba pri pridávaní tagu:', error);
      alert('Chyba pri pridávaní tagu');
    }
  };

  // Editácia tagu
  const handleEditTag = async (tagId: number, updatedTag: Partial<ManualTag>) => {
    try {
      const response = await fetch('/api/manual-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: ownerId,
          tag_key: updatedTag.tag_key,
          tag_value: updatedTag.tag_value,
          is_locked: updatedTag.is_locked
        })
      });

      if (response.ok) {
        await fetchTags();
        setEditingTag(null);
        onTagsChange?.();
      } else {
        const error = await response.json();
        alert(`Chyba pri editácii tagu: ${error.error}`);
      }
    } catch (error) {
      console.error('Chyba pri editácii tagu:', error);
      alert('Chyba pri editácii tagu');
    }
  };

  // Vymazanie tagu
  const handleDeleteTag = async (tagId: number) => {
    if (!confirm('Naozaj chcete vymazať tento tag?')) {
      return;
    }

    try {
      const response = await fetch(`/api/manual-tags?tag_id=${tagId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchTags();
        onTagsChange?.();
      } else {
        const error = await response.json();
        alert(`Chyba pri mazaní tagu: ${error.error}`);
      }
    } catch (error) {
      console.error('Chyba pri mazaní tagu:', error);
      alert('Chyba pri mazaní tagu');
    }
  };

  if (loading) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-amber-200 dark:bg-amber-700 rounded w-32"></div>
          <div className="h-6 bg-amber-200 dark:bg-amber-700 rounded w-24"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-amber-100 dark:bg-amber-800 rounded-full">
            <Tag className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <h4 className="font-medium text-amber-900 dark:text-amber-100">
            Vlastné tagy ({tags.length})
          </h4>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
          title="Pridať nový tag"
        >
          <Plus className="h-3 w-3" />
          Pridať
        </button>
      </div>

      {/* Formulár pre nový tag */}
      {showAddForm && (
        <div className="bg-amber-100 dark:bg-amber-800 rounded p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Kľúč (napr. 'poznámka')"
              value={newTag.key}
              onChange={(e) => setNewTag({ ...newTag, key: e.target.value })}
              className="px-2 py-1 text-sm border border-amber-300 dark:border-amber-600 rounded bg-white dark:bg-gray-900"
            />
            <input
              type="text"
              placeholder="Hodnota"
              value={newTag.value}
              onChange={(e) => setNewTag({ ...newTag, value: e.target.value })}
              className="px-2 py-1 text-sm border border-amber-300 dark:border-amber-600 rounded bg-white dark:bg-gray-900"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
              <input
                type="checkbox"
                checked={newTag.is_locked}
                onChange={(e) => setNewTag({ ...newTag, is_locked: e.target.checked })}
                className="rounded"
              />
              Zamknúť proti prepísaniu
            </label>
            <div className="flex gap-1">
              <button
                onClick={handleAddTag}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
              >
                <Save className="h-3 w-3" />
                Uložiť
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTag({ key: '', value: '', is_locked: false });
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded"
              >
                <X className="h-3 w-3" />
                Zrušiť
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoznam tagov */}
      {tags.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 italic">
          Žiadne vlastné tagy. Kliknite na "Pridať" pre vytvorenie nového tagu.
        </p>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <TagItem
              key={tag.id}
              tag={tag}
              isEditing={editingTag === tag.id}
              onEdit={() => setEditingTag(tag.id)}
              onSave={(updatedTag) => handleEditTag(tag.id, updatedTag)}
              onCancel={() => setEditingTag(null)}
              onDelete={() => handleDeleteTag(tag.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Komponent pre jednotlivý tag
interface TagItemProps {
  tag: ManualTag;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updatedTag: Partial<ManualTag>) => void;
  onCancel: () => void;
  onDelete: () => void;
}

function TagItem({ tag, isEditing, onEdit, onSave, onCancel, onDelete }: TagItemProps) {
  const [editedTag, setEditedTag] = useState({
    tag_key: tag.tag_key,
    tag_value: tag.tag_value,
    is_locked: tag.is_locked
  });

  if (isEditing) {
    return (
      <div className="bg-amber-100 dark:bg-amber-800 rounded p-2 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={editedTag.tag_key}
            onChange={(e) => setEditedTag({ ...editedTag, tag_key: e.target.value })}
            className="px-2 py-1 text-xs border border-amber-300 dark:border-amber-600 rounded bg-white dark:bg-gray-900"
          />
          <input
            type="text"
            value={editedTag.tag_value}
            onChange={(e) => setEditedTag({ ...editedTag, tag_value: e.target.value })}
            className="px-2 py-1 text-xs border border-amber-300 dark:border-amber-600 rounded bg-white dark:bg-gray-900"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
            <input
              type="checkbox"
              checked={editedTag.is_locked}
              onChange={(e) => setEditedTag({ ...editedTag, is_locked: e.target.checked })}
              className="rounded"
            />
            Zamknúť
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => onSave(editedTag)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
            >
              <Save className="h-3 w-3" />
              Uložiť
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              <X className="h-3 w-3" />
              Zrušiť
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded border border-amber-200 dark:border-amber-700 p-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-medium text-xs text-amber-800 dark:text-amber-200 uppercase tracking-wide">
          {tag.tag_key}:
        </span>
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
          {tag.tag_value}
        </span>
        {tag.is_locked && (
          <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" title="Zamknuté proti prepísaniu" />
        )}
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onEdit}
          className="p-1 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          title="Editovať tag"
        >
          <Edit2 className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
          title="Vymazať tag"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
