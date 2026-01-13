import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';

// Build tree structure from flat file list
const buildTree = (files) => {
  const root = { name: 'root', children: {}, isFolder: true };

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;

    parts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          children: {},
          isFolder: index < parts.length - 1,
          file: index === parts.length - 1 ? file : null,
        };
      }
      current = current.children[part];
    });
  });

  return root;
};

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const iconColors = {
    js: 'text-yellow-400',
    jsx: 'text-cyan-400',
    ts: 'text-blue-400',
    tsx: 'text-blue-400',
    py: 'text-green-400',
    json: 'text-yellow-500',
    html: 'text-orange-400',
    css: 'text-blue-500',
    md: 'text-gray-400',
    txt: 'text-gray-400',
  };
  return iconColors[ext] || 'text-gray-400';
};

const TreeNode = ({ node, depth = 0, onSelect, selectedPath }) => {
  const [isOpen, setIsOpen] = useState(depth < 2);

  const children = Object.values(node.children || {});
  const hasChildren = children.length > 0;

  if (node.name === 'root') {
    return (
        <div className="text-sm font-mono">
          {children.map((child) => (
              <TreeNode
                  key={child.name}
                  node={child}
                  depth={0}
                  onSelect={onSelect}
                  selectedPath={selectedPath}
              />
          ))}
        </div>
    );
  }

  const isSelected = node.file && node.file.path === selectedPath;

  return (
      <div>
        <div
            className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded transition-colors
          ${isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-white/5 text-gray-300'}
          ${node.isFolder ? 'font-medium' : ''}
        `}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (node.isFolder) {
                setIsOpen(!isOpen);
              } else if (node.file) {
                onSelect(node.file);
              }
            }}
        >
          {node.isFolder ? (
              <>
                {hasChildren ? (
                    isOpen ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    )
                ) : (
                    <span className="w-4" />
                )}
                {isOpen ? (
                    <FolderOpen className="w-4 h-4 text-cyan-400" />
                ) : (
                    <Folder className="w-4 h-4 text-cyan-400" />
                )}
              </>
          ) : (
              <>
                <span className="w-4" />
                <File className={`w-4 h-4 ${getFileIcon(node.name)}`} />
              </>
          )}
          <span className="ml-1 truncate">{node.name}</span>
        </div>

        {node.isFolder && isOpen && hasChildren && (
            <div>
              {children
                  .sort((a, b) => {
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((child) => (
                      <TreeNode
                          key={child.name}
                          node={child}
                          depth={depth + 1}
                          onSelect={onSelect}
                          selectedPath={selectedPath}
                      />
                  ))}
            </div>
        )}
      </div>
  );
};

export const FileTree = ({ files = [], onSelect, selectedPath }) => {
  const tree = buildTree(files);

  return (
      <div className="h-full overflow-auto py-2">
        <TreeNode node={tree} onSelect={onSelect} selectedPath={selectedPath} />
      </div>
  );
};
