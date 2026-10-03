import { BlockTitle, Link, List, ListItem, Navbar, Page, Popup, Searchbar } from 'konsta/react'
import { useMemo, useState } from 'react'
import { EXERCISE_LIBRARY } from '../lib/exercises'
import { IconPlus } from './icons'

/** Full-screen searchable list of common exercises, plus "add your own". */
export function ExercisePicker({
  opened,
  onClose,
  onPick,
}: {
  opened: boolean
  onClose: () => void
  onPick: (name: string) => void
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.entries(EXERCISE_LIBRARY)
      .map(([group, names]) => [group, names.filter((n) => !q || n.toLowerCase().includes(q))] as const)
      .filter(([, names]) => names.length > 0)
  }, [query])

  function pick(name: string) {
    onPick(name)
    setQuery('')
    onClose()
  }

  const custom = query.trim()

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar
          title="Add Exercise"
          right={
            <Link onClick={onClose}>
              Cancel
            </Link>
          }
          subnavbar={
            <Searchbar
              value={query}
              placeholder="Search exercises"
              onInput={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              disableButton={false}
            />
          }
        />
        {custom && (
          <List strongIos insetIos className="mt-4!">
            <ListItem
              link
              chevron={false}
              title={`Add “${custom}”`}
              media={<IconPlus className="text-primary" />}
              onClick={() => pick(custom)}
            />
          </List>
        )}
        {groups.map(([group, names]) => (
          <div key={group}>
            <BlockTitle>{group}</BlockTitle>
            <List strongIos insetIos>
              {names.map((n) => (
                <ListItem key={n} link chevron={false} title={n} onClick={() => pick(n)} />
              ))}
            </List>
          </div>
        ))}
        <div className="h-10" />
      </Page>
    </Popup>
  )
}
