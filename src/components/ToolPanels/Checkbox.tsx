// --- 自定义复选框组件 ---
export const Checkbox = ({ label, checked, onChange, styles, style }: any) => {
    return (
        <label
            style={{
                ...styles.checkboxContainer,
                ...style,
            }}
            onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        >
            <div style={styles.checkboxCustom(checked)}>
                {checked && (
                    <div style={styles.checkboxCheckmark}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                )}
            </div>
            {label && <span style={{ marginLeft: 4 }}>{label}</span>}
        </label>
    );
};
