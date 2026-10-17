import { Link, useNavigate } from 'react-router'
import { useDeleteRuleset, useDuplicateRuleset, useRulesets } from '../../api/queries'
import { ConfirmButton } from '../../components/ConfirmButton'
import ui from '../../components/ui.module.css'
import s from './editor/editor.module.css'

export function RulesetList() {
  const rulesets = useRulesets()
  const duplicate = useDuplicateRuleset()
  const remove = useDeleteRuleset()
  const navigate = useNavigate()

  return (
    <div className={s.listPage}>
      <div className={s.listHeading}>
        <h1>Rulesets</h1>
        <Link to="/rulesets/new" className={s.newButton}>
          New ruleset
        </Link>
      </div>
      <ul className={s.list}>
        {rulesets.data?.map((ruleset) => (
          <li key={ruleset.id} className={s.listItem}>
            <Link to={`/rulesets/${ruleset.id}`} className={s.listLink}>
              <span className={s.listName}>{ruleset.name}</span>
              {ruleset.description && <span className={s.muted}>{ruleset.description}</span>}
              <span className={s.muted}>
                {ruleset.objectiveCount} objectives · updated{' '}
                {new Date(ruleset.updatedAt).toLocaleDateString()}
              </span>
            </Link>
            <button
              onClick={() =>
                duplicate.mutate(ruleset.id, {
                  onSuccess: (record) => navigate(`/rulesets/${record.ruleset.id}`),
                })
              }
            >
              Duplicate
            </button>
            <ConfirmButton
              className={ui.danger}
              onConfirm={() => remove.mutate(ruleset.id)}
              confirmLabel="Delete?"
              title="Past matches keep their own copy"
            >
              Delete
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
