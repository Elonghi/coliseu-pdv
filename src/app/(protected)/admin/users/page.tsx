import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { userAction } from "@/modules/admin/actions";
import { permissionOptions, permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

export const dynamic = "force-dynamic";
type UserRow = { id: string; name: string; email: string; role: string; active: boolean; permissions: string[]; totp_enabled: boolean };

function UserFields({ user }: { user?: UserRow }) {
  return <>
    <input type="hidden" name="id" value={user?.id ?? ""}/>
    <div className="grid sm:grid-cols-2 gap-4">
      <label className="label">Nome<input className="field" name="name" defaultValue={user?.name} required/></label>
      <label className="label">E-mail<input className="field" type="email" name="email" defaultValue={user?.email} required/></label>
      <label className="label">Perfil<select className="field" name="role" defaultValue={user?.role ?? "OPERATOR"}><option value="OPERATOR">Operador</option><option value="ADMIN">Administrador</option></select><span className="field-hint">Administradores têm acesso a todas as áreas.</span></label>
      <label className="label">{user ? "Nova senha (opcional)" : "Senha"}<input className="field" type="password" name="password" minLength={user ? undefined : 8} required={!user} autoComplete="new-password"/>{!user && <span className="field-hint">Mínimo de 8 caracteres.</span>}</label>
    </div>
    <div className="grid gap-2">
      <div><h3 className="panel-title">Permissões adicionais</h3><p className="panel-desc">Liberam áreas específicas para operadores.</p></div>
      <div className="grid sm:grid-cols-2 gap-2">{permissionOptions.map((option) => <label className="check-card" key={option.code}><input type="checkbox" name="permissions" value={option.code} defaultChecked={user?.permissions?.includes(option.code)}/>{option.label}</label>)}</div>
    </div>
    <div className="grid gap-3">
      <label className="switch"><input type="checkbox" name="active" value="true" defaultChecked={user?.active ?? true}/><span>Usuário ativo<small>Usuários inativos não conseguem entrar no sistema.</small></span></label>
      {user?.totp_enabled && <label className="switch"><input type="checkbox" name="resetTotp" value="true"/><span>Redefinir 2FA deste usuário<small>A pessoa precisará configurar a autenticação em duas etapas novamente.</small></span></label>}
    </div>
  </>;
}

export default async function UsersPage() {
  await requirePermission(permissions.USERS_MANAGE);
  const users = await pool.query<UserRow>("SELECT u.id,u.name,u.email,u.role,u.active,u.totp_enabled,COALESCE(array_agg(up.permission) FILTER(WHERE up.permission IS NOT NULL),'{}') permissions FROM users u LEFT JOIN user_permissions up ON up.user_id=u.id GROUP BY u.id ORDER BY u.active DESC,u.name");
  return <div className="section-gap">
    <PageHeader
      eyebrow="Acesso"
      title="Usuários e permissões"
      description="Defina quem acessa o sistema e o que cada pessoa pode fazer."
      actions={<Modal trigger={<><Plus size={16}/>Novo usuário</>} triggerClassName="btn btn-success" size="lg" title="Novo usuário" description="A pessoa entra com o e-mail e a senha definidos aqui.">
        <ActionForm action={userAction} submitLabel="Criar usuário" className="grid gap-5"><UserFields/></ActionForm>
      </Modal>}
    />
    <section className="card">
      <div className="table-wrap"><table>
        <thead><tr><th>Usuário</th><th>Perfil</th><th>Permissões</th><th>2FA</th><th>Status</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{users.rows.map((user) => <tr key={user.id}>
          <td className="cell-wrap"><span className="cell-main"><b>{user.name}</b><small>{user.email}</small></span></td>
          <td><Badge tone={user.role === "ADMIN" ? "info" : "neutral"}>{user.role === "ADMIN" ? "Administrador" : "Operador"}</Badge></td>
          <td className="muted">{user.role === "ADMIN" ? "Acesso total" : user.permissions.length ? `${user.permissions.length} adicional(is)` : "Somente PDV"}</td>
          <td>{user.totp_enabled ? <Badge tone="ok"><ShieldCheck size={12}/>Ativo</Badge> : <span className="muted">Não configurado</span>}</td>
          <td><Badge tone={user.active ? "ok" : "neutral"} dot>{user.active ? "Ativo" : "Inativo"}</Badge></td>
          <td className="col-actions"><Modal trigger={<><Pencil size={14}/>Editar</>} triggerClassName="btn btn-ghost btn-sm" size="lg" title="Editar usuário" description={user.email}>
            <ActionForm action={userAction} submitLabel="Salvar alterações" className="grid gap-5"><UserFields user={user}/></ActionForm>
          </Modal></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
